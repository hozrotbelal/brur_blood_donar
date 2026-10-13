import { AuditEntry, validateAuditEntry } from './audit.service';

const base: AuditEntry = {
  category: 'DATA_CHANGE',
  action: 'UPDATE',
  result: 'SUCCESS',
  actorUserId: 'u1',
  actorRole: 'SUP',
  correlationId: 'c1',
};

describe('validateAuditEntry', () => {
  it('accepts an ordinary entry', () => {
    expect(() => validateAuditEntry(base)).not.toThrow();
  });

  it('requires a reason for a successful sensitive read, but not for a denied one', () => {
    const read = { ...base, category: 'SENSITIVE_READ' as const };
    expect(() => validateAuditEntry(read)).toThrow('reason');
    expect(() => validateAuditEntry({ ...read, result: 'DENIED' })).not.toThrow();
    expect(() => validateAuditEntry({ ...read, reasonCode: 'ON_CASE' })).not.toThrow();
  });

  it('requires SYSTEM and a missing user id to go together', () => {
    expect(() => validateAuditEntry({ ...base, actorRole: 'SYSTEM' })).toThrow();
    expect(() => validateAuditEntry({ ...base, actorUserId: null })).toThrow();
    expect(() => validateAuditEntry({ ...base, actorRole: 'SYSTEM', actorUserId: null })).not.toThrow();
  });
});
