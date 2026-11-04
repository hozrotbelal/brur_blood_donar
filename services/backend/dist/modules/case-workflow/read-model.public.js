"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.latestOutcomeConfidence = latestOutcomeConfidence;
exports.caseOwnersForRequest = caseOwnersForRequest;
exports.openCasesOwnedBy = openCasesOwnedBy;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function latestOutcomeConfidence(db, requestIds) {
    const result = new Map();
    if (requestIds.length === 0)
        return result;
    const rows = await db.orm
        .select({ requestId: schema_1.outcomeUpdate.requestId, confidence: schema_1.outcomeUpdate.confidence })
        .from(schema_1.outcomeUpdate)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.outcomeUpdate.requestId, requestIds), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.isDisputed, false)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.outcomeUpdate.reportedAt));
    for (const row of rows)
        if (!result.has(row.requestId))
            result.set(row.requestId, row.confidence);
    return result;
}
async function caseOwnersForRequest(db, requestId) {
    const rows = await db.orm
        .select({ ownerUserId: schema_1.coordinationCase.ownerUserId })
        .from(schema_1.coordinationCase)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coordinationCase.requestId, requestId), (0, drizzle_orm_1.isNotNull)(schema_1.coordinationCase.ownerUserId)));
    return [...new Set(rows.map((r) => r.ownerUserId))];
}
async function openCasesOwnedBy(db, userId) {
    return db.orm
        .select({ id: schema_1.coordinationCase.id, caseNo: schema_1.coordinationCase.caseNo, requestId: schema_1.coordinationCase.requestId })
        .from(schema_1.coordinationCase)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coordinationCase.ownerUserId, userId), (0, drizzle_orm_1.notInArray)(schema_1.coordinationCase.status, ['Resolved', 'Closed'])));
}
//# sourceMappingURL=read-model.public.js.map