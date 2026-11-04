import { Captured, fakeDb } from '../../../test/fake-db';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { DomainEvent, EventBus } from '../../platform/outbox/event-bus';
import { DonationRecordProjector } from './donation-record.projector';

const confirmed = {
  outcomeId: 'o1',
  caseDonorId: 'cd1',
  donorProfileId: 'dp1',
  outcomeType: 'DONATION_COMPLETED',
  sourceType: 'COLLECTION_SERVICE_CONFIRMATION',
  confidence: 'Service-confirmed',
  reportedAt: '2026-10-10T04:00:00.000Z',
};

const event = (payload: Record<string, unknown>): DomainEvent => ({
  id: 'e1',
  aggregateType: 'COORDINATION_CASE',
  aggregateId: 'c1',
  eventType: 'OutcomeRecorded',
  payload,
});

function setup(insertRows: unknown[][]) {
  const tx = fakeDb((s: Captured) => (s.text.startsWith('insert into "idn"."donation_record"') ? { rows: insertRows } : undefined));
  const db = { transaction: jest.fn(async (work: (t: Db) => Promise<unknown>) => work(tx)) } as unknown as DatabaseService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const bus = new EventBus();
  const projector = new DonationRecordProjector(db, bus, audit);
  return { projector, bus, tx, audit, db };
}

describe('DonationRecordProjector', () => {
  it('ignores self-reported outcomes', async () => {
    const { projector, db } = setup([['d1', '2026-10-10']]);
    await projector.handle(event({ ...confirmed, confidence: 'Self-reported', sourceType: 'DONOR_SELF_REPORT' }));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('ignores hospital confirmations until the donation source mapping is decided', async () => {
    const { projector, db } = setup([['d1', '2026-10-10']]);
    await projector.handle(event({ ...confirmed, sourceType: 'HOSPITAL_CONFIRMATION' }));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('ignores outcomes that are not a completed donation', async () => {
    const { projector, db } = setup([['d1', '2026-10-10']]);
    await projector.handle(event({ ...confirmed, outcomeType: 'DONATION_NOT_COMPLETED' }));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('ignores outcomes that are not linked to a case donor', async () => {
    const { projector, db } = setup([['d1', '2026-10-10']]);
    await projector.handle(event({ ...confirmed, caseDonorId: null, donorProfileId: null }));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('creates a service-confirmed donation record and moves last donation date forward', async () => {
    const { projector, tx, audit } = setup([['d1', '2026-10-10']]);
    await projector.handle(event(confirmed));

    const insert = tx.statements.find((s) => s.text.startsWith('insert into "idn"."donation_record"'));
    expect(insert?.text).toContain('on conflict ("case_donor_id") do nothing');
    expect(insert?.values).toEqual(expect.arrayContaining(['dp1', '2026-10-10T04:00:00.000Z', 'COLLECTION_SERVICE_CONFIRMATION', 'cd1', 'o1']));

    const update = tx.statements.find((s) => s.text.startsWith('update "idn"."donor_profile"'));
    expect(update?.text).toContain('greatest(');
    expect(update?.values).toEqual(expect.arrayContaining(['2026-10-10', 'dp1']));

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DonationRecorded', entityType: 'DONATION_RECORD', entityId: 'd1', actorRole: 'SYSTEM' }),
    );
  });

  it('does nothing on a retried event when the donation record already exists', async () => {
    const { projector, tx, audit } = setup([]);
    await projector.handle(event(confirmed));
    expect(tx.statements.some((s) => s.text.startsWith('update "idn"."donor_profile"'))).toBe(false);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('subscribes to OutcomeRecorded when the module starts', () => {
    const { projector, bus } = setup([]);
    const subscribe = jest.spyOn(bus, 'subscribe');
    projector.onModuleInit();
    expect(subscribe).toHaveBeenCalledWith('OutcomeRecorded', expect.any(Function));
  });
});
