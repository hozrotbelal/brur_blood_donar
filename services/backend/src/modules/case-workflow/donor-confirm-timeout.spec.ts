import { Captured, fakeDb } from '../../../test/fake-db';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { CaseRow, CaseSupport } from './case.support';
import { CaseService } from './case.service';
import { StatusHistoryService } from '../../platform/status/status-history.service';

const candidate = ['cd1', 'c1', 'dp1'];
const caseRow = { id: 'c1', requestId: 'r1', ownerUserId: 'u1' } as unknown as CaseRow;
const isCandidateQuery = (s: Captured) => s.text.startsWith('select "crd"."case_donor"."id"');

function setup(candidates: unknown[][], confirmedInTx: unknown[][] = []) {
  const outer = fakeDb((s) => (isCandidateQuery(s) ? { rows: candidates } : undefined));
  const tx = fakeDb((s) => (s.text.startsWith('select "id" from "crd"."appointment"') ? { rows: confirmedInTx } : undefined));
  const db = { ...outer, transaction: jest.fn(async (work: (t: Db) => Promise<unknown>) => work(tx)) } as unknown as DatabaseService;
  const support = {
    loadCase: jest.fn().mockResolvedValue(caseRow),
    openTask: jest.fn().mockResolvedValue(undefined),
    event: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CaseService(db, support as unknown as CaseSupport, {} as StatusHistoryService);
  return { service, support, outer };
}

describe('CaseService.flagUnconfirmedDonors', () => {
  it('creates one callback task and one follow-up event for each unconfirmed donor', async () => {
    const { service, support } = setup([candidate]);
    expect(await service.flagUnconfirmedDonors()).toBe(1);

    expect(support.openTask).toHaveBeenCalledTimes(1);
    expect(support.openTask).toHaveBeenCalledWith(expect.anything(), caseRow, 'TK_CALLBACK', 'donor-confirm-timeout:cd1', 0, 'cd1');
    expect(support.event).toHaveBeenCalledWith(expect.anything(), 'CASE_DONOR', 'cd1', 'DonorConfirmationTimedOut', {
      caseId: 'c1',
      caseDonorId: 'cd1',
      requestId: 'r1',
      donorProfileId: 'dp1',
    });
  });

  it('uses the Critical and default timeouts in the candidate query', async () => {
    const { service, outer } = setup([]);
    await service.flagUnconfirmedDonors();
    const query = outer.statements.find(isCandidateQuery)!;
    expect(query.text).toMatch(/make_interval\(mins => CASE WHEN "crd"\."coordination_case"\."priority" = 'Critical' THEN \$(\d+)::int ELSE \$(\d+)::int END\)/);
    const [, critical, other] = query.text.match(/THEN \$(\d+)::int ELSE \$(\d+)::int/)!;
    expect([query.values[Number(critical) - 1], query.values[Number(other) - 1]]).toEqual([15, 60]);
    expect(query.text).toContain('not exists (select "id" from "crd"."appointment" where ("crd"."appointment"."case_donor_id" = "crd"."case_donor"."id" and "crd"."appointment"."confirmed_by_donor_at" is not null))');
  });

  it('does nothing when the donor confirmed between selection and the transaction', async () => {
    const { service, support } = setup([candidate], [['a1']]);
    await service.flagUnconfirmedDonors();
    expect(support.openTask).not.toHaveBeenCalled();
    expect(support.event).not.toHaveBeenCalled();
  });
});
