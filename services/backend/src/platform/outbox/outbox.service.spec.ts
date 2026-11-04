import { fakeDb } from '../../../test/fake-db';
import { EventBus } from './event-bus';
import { OutboxService, outboxDedupeKey } from './outbox.service';

describe('OutboxService', () => {
  it('writes through the caller transaction with a stable dedupe key', async () => {
    const tx = fakeDb();
    await new OutboxService().append(tx, {
      aggregateType: 'BLOOD_REQUEST',
      aggregateId: 'r1',
      eventType: 'RequestVerified',
      payload: { a: 1 },
      version: 3,
    });
    expect(tx.statements).toHaveLength(1);
    expect(tx.statements[0].text).toContain('insert into "platform"."outbox_event"');
    expect(tx.statements[0].text).toContain('on conflict ("dedupe_key") do nothing');
    expect(tx.statements[0].values).toContain('BLOOD_REQUEST:r1:RequestVerified:3');
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
