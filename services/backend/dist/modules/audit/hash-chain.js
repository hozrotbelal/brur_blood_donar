"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENESIS_HASH = void 0;
exports.canonicalJson = canonicalJson;
exports.chainHash = chainHash;
exports.verifyChain = verifyChain;
exports.auditHashRecord = auditHashRecord;
const node_crypto_1 = require("node:crypto");
function canonicalJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    const entries = Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
exports.GENESIS_HASH = Buffer.alloc(32);
function chainHash(prevHash, record) {
    return (0, node_crypto_1.createHash)('sha256').update(prevHash).update(canonicalJson(record)).digest();
}
function verifyChain(rows) {
    let expectedPrev = exports.GENESIS_HASH;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.prevHash.equals(expectedPrev) || !chainHash(row.prevHash, row.record).equals(row.hash))
            return i;
        expectedPrev = row.hash;
    }
    return -1;
}
function auditHashRecord(f) {
    return {
        occurredAt: new Date(f.occurredAt).toISOString(),
        category: f.category,
        action: f.action,
        result: f.result,
        actorUserId: f.actorUserId ?? null,
        actorRole: f.actorRole,
        permissionUsed: f.permissionUsed ?? null,
        entityType: f.entityType ?? null,
        entityId: f.entityId ?? null,
        subjectUserId: f.subjectUserId ?? null,
        contextRequestId: f.contextRequestId ?? null,
        fieldGroup: f.fieldGroup ?? null,
        reasonCode: f.reasonCode ?? null,
        reasonText: f.reasonText ?? null,
        changes: f.changes ?? null,
        correlationId: f.correlationId,
        chainSeq: String(f.chainSeq),
    };
}
//# sourceMappingURL=hash-chain.js.map