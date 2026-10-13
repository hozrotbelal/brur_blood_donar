import { Db } from '../db/database.service';
import { EventBus } from './event-bus';
import { OutboxService, outboxDedupeKey } from './outbox.service';

describe('OutboxService', () => {
  it('writes through the caller transaction with a stable dedupe key', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const tx = { query } as unknown as Db;
    await new OutboxService().append(tx, {
      aggregateType: 'BLOOD_REQUEST',
      aggregateId: 'r1',
      eventType: 'RequestVerified',
      payload: { a: 1 },
      version: 3,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][4]).toBe('BLOOD_REQUEST:r1:RequestVerified:3');
    expect(outboxDedupeKey({ aggregateType: 'X', aggregateId: 'y', eventType: 'Z' })).toBe('X:y:Z:1');
  });
});

describe('EventBus', () => {
  it('delivers an event to every subscriber of its type', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe('A', async (e) => void seen.push(`1:${e.id}`));
    bus.subscribe('A', async (e) => void seen.push(`2:${e.id}`));
    bus.subscribe('B', async () => void seen.push('never'));
    await bus.publish({ id: 'e1', aggregateType: 't', aggregateId: 'a', eventType: 'A', payload: {} });
    expect(seen).toEqual(['1:e1', '2:e1']);
  });
});
