import { Db } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { InvalidTransitionError, StateMachine } from './state-machine';
import { StatusHistoryService } from './status-history.service';

type S = 'A' | 'B' | 'C';
const machine = new StateMachine<S>({ A: ['B'], B: ['C'], C: [] });

describe('StateMachine', () => {
  it('allows listed transitions only', () => {
    expect(machine.can('A', 'B')).toBe(true);
    expect(machine.can('A', 'C')).toBe(false);
    expect(machine.isTerminal('C')).toBe(true);
    expect(() => machine.assert('C', 'A')).toThrow(InvalidTransitionError);
  });
});

describe('StatusHistoryService', () => {
  const change = {
    entityType: 'BLOOD_REQUEST',
    entityId: 'r1',
    to: 'B' as S,
    actorUserId: 'u1',
    actorRole: 'SUP' as const,
    source: 'USER' as const,
    correlationId: 'c1',
  };

  it('writes the history row and an outbox audit event in the same transaction', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const service = new StatusHistoryService(new AuditService(new OutboxService()));
    await service.record({ query } as unknown as Db, { ...change, from: 'A' }, machine);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('aud.status_history');
    expect(query.mock.calls[1][0]).toContain('platform.outbox_event');
  });

  it('refuses an invalid transition before writing anything', async () => {
    const query = jest.fn();
    const service = new StatusHistoryService(new AuditService(new OutboxService()));
    await expect(
      service.record({ query } as unknown as Db, { ...change, from: 'A', to: 'C' }, machine),
    ).rejects.toThrow(InvalidTransitionError);
    expect(query).not.toHaveBeenCalled();
  });
});
