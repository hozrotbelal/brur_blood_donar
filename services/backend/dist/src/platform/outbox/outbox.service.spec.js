"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_bus_1 = require("./event-bus");
const outbox_service_1 = require("./outbox.service");
describe('OutboxService', () => {
    it('writes through the caller transaction with a stable dedupe key', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
        const tx = { query };
        await new outbox_service_1.OutboxService().append(tx, {
            aggregateType: 'BLOOD_REQUEST',
            aggregateId: 'r1',
            eventType: 'RequestVerified',
            payload: { a: 1 },
            version: 3,
        });
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][1][4]).toBe('BLOOD_REQUEST:r1:RequestVerified:3');
        expect((0, outbox_service_1.outboxDedupeKey)({ aggregateType: 'X', aggregateId: 'y', eventType: 'Z' })).toBe('X:y:Z:1');
    });
});
describe('EventBus', () => {
    it('delivers an event to every subscriber of its type', async () => {
        const bus = new event_bus_1.EventBus();
        const seen = [];
        bus.subscribe('A', async (e) => void seen.push(`1:${e.id}`));
        bus.subscribe('A', async (e) => void seen.push(`2:${e.id}`));
        bus.subscribe('B', async () => void seen.push('never'));
        await bus.publish({ id: 'e1', aggregateType: 't', aggregateId: 'a', eventType: 'A', payload: {} });
        expect(seen).toEqual(['1:e1', '2:e1']);
    });
});
//# sourceMappingURL=outbox.service.spec.js.map