"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markSearching = markSearching;
exports.markFirstWilling = markFirstWilling;
exports.markFirstInvited = markFirstInvited;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const request_status_1 = require("./request-status");
const schema_1 = require("./schema");
async function markSearching(tx, history, requestId, actor) {
    if (!(0, request_status_1.findTransition)('Verified', 'start_search'))
        throw new common_1.HttpException({ code: 'INVALID_TRANSITION' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
    await tx.orm
        .update(schema_1.bloodRequest)
        .set({ status: 'Searching', version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId));
    await history.record(tx, {
        entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Verified', to: 'Searching', actorUserId: actor,
        actorRole: actor ? 'SUP' : 'SYSTEM', source: actor ? 'USER' : 'SYSTEM', contextRequestId: requestId, correlationId: (0, node_crypto_1.randomUUID)(),
    }, request_status_1.requestStateMachine);
}
async function markFirstWilling(tx, history, requestId) {
    const [row] = await tx.orm.select({ status: schema_1.bloodRequest.status }).from(schema_1.bloodRequest).where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId)).for('update');
    await tx.orm
        .update(schema_1.bloodRequest)
        .set({ firstWillingAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.bloodRequest.firstWillingAt}, now())` })
        .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId));
    if (row?.status !== 'Searching')
        return;
    await tx.orm
        .update(schema_1.bloodRequest)
        .set({ status: 'Donor coordination', version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId));
    await history.record(tx, {
        entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Searching', to: 'Donor coordination', actorUserId: null,
        actorRole: 'SYSTEM', source: 'SYSTEM', contextRequestId: requestId, reasonCode: 'FIRST_AVAILABLE_RESPONSE', correlationId: (0, node_crypto_1.randomUUID)(),
    }, request_status_1.requestStateMachine);
}
async function markFirstInvited(tx, requestIds) {
    const unique = [...new Set(requestIds)];
    if (unique.length === 0)
        return;
    await tx.orm
        .update(schema_1.bloodRequest)
        .set({ firstInvitedAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.bloodRequest.firstInvitedAt}, now())` })
        .where((0, drizzle_orm_1.inArray)(schema_1.bloodRequest.id, unique));
}
//# sourceMappingURL=search-progress.js.map