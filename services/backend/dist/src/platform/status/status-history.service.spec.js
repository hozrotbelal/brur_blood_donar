"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const audit_service_1 = require("../audit/audit.service");
const outbox_service_1 = require("../outbox/outbox.service");
const state_machine_1 = require("./state-machine");
const status_history_service_1 = require("./status-history.service");
const machine = new state_machine_1.StateMachine({ A: ['B'], B: ['C'], C: [] });
describe('StateMachine', () => {
    it('allows listed transitions only', () => {
        expect(machine.can('A', 'B')).toBe(true);
        expect(machine.can('A', 'C')).toBe(false);
        expect(machine.isTerminal('C')).toBe(true);
        expect(() => machine.assert('C', 'A')).toThrow(state_machine_1.InvalidTransitionError);
    });
});
describe('StatusHistoryService', () => {
    const change = {
        entityType: 'BLOOD_REQUEST',
        entityId: 'r1',
        to: 'B',
        actorUserId: 'u1',
        actorRole: 'SUP',
        source: 'USER',
        correlationId: 'c1',
    };
    it('writes the history row and an outbox audit event in the same transaction', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
        const service = new status_history_service_1.StatusHistoryService(new audit_service_1.AuditService(new outbox_service_1.OutboxService()));
        await service.record({ query }, { ...change, from: 'A' }, machine);
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][0]).toContain('aud.status_history');
        expect(query.mock.calls[1][0]).toContain('platform.outbox_event');
    });
    it('refuses an invalid transition before writing anything', async () => {
        const query = jest.fn();
        const service = new status_history_service_1.StatusHistoryService(new audit_service_1.AuditService(new outbox_service_1.OutboxService()));
        await expect(service.record({ query }, { ...change, from: 'A', to: 'C' }, machine)).rejects.toThrow(state_machine_1.InvalidTransitionError);
        expect(query).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=status-history.service.spec.js.map