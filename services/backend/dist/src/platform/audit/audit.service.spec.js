"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const audit_service_1 = require("./audit.service");
const base = {
    category: 'DATA_CHANGE',
    action: 'UPDATE',
    result: 'SUCCESS',
    actorUserId: 'u1',
    actorRole: 'SUP',
    correlationId: 'c1',
};
describe('validateAuditEntry', () => {
    it('accepts an ordinary entry', () => {
        expect(() => (0, audit_service_1.validateAuditEntry)(base)).not.toThrow();
    });
    it('requires a reason for a successful sensitive read, but not for a denied one', () => {
        const read = { ...base, category: 'SENSITIVE_READ' };
        expect(() => (0, audit_service_1.validateAuditEntry)(read)).toThrow('reason');
        expect(() => (0, audit_service_1.validateAuditEntry)({ ...read, result: 'DENIED' })).not.toThrow();
        expect(() => (0, audit_service_1.validateAuditEntry)({ ...read, reasonCode: 'ON_CASE' })).not.toThrow();
    });
    it('requires SYSTEM and a missing user id to go together', () => {
        expect(() => (0, audit_service_1.validateAuditEntry)({ ...base, actorRole: 'SYSTEM' })).toThrow();
        expect(() => (0, audit_service_1.validateAuditEntry)({ ...base, actorUserId: null })).toThrow();
        expect(() => (0, audit_service_1.validateAuditEntry)({ ...base, actorRole: 'SYSTEM', actorUserId: null })).not.toThrow();
    });
});
//# sourceMappingURL=audit.service.spec.js.map