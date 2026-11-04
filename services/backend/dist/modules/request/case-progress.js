"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestState = requestState;
exports.returnToSearching = returnToSearching;
exports.markDonationReported = markDonationReported;
exports.recordFulfilment = recordFulfilment;
exports.closeRequest = closeRequest;
exports.declareRequestUnable = declareRequestUnable;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const request_status_1 = require("./request-status");
const schema_1 = require("./schema");
async function requestState(db, requestId, lock = false) {
    const query = db.orm
        .select({
        status: schema_1.bloodRequest.status, urgency: schema_1.bloodRequest.urgency, quantityUnits: schema_1.bloodRequest.quantityUnits,
        areaId: schema_1.bloodRequest.areaId, assignedSupportUserId: schema_1.bloodRequest.assignedSupportUserId,
    })
        .from(schema_1.bloodRequest)
        .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId));
    const [row] = lock ? await query.for('update') : await query;
    return row ?? null;
}
async function move(tx, history, requestId, from, command, actor, note = {}, extra = {}) {
    const transition = (0, request_status_1.findTransition)(from, command);
    if (!transition)
        throw new common_1.HttpException({ code: 'INVALID_TRANSITION' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
    await tx.orm
        .update(schema_1.bloodRequest)
        .set({ status: transition.to, ...extra, version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId));
    await history.record(tx, {
        entityType: 'BLOOD_REQUEST', entityId: requestId, from, to: transition.to, actorUserId: actor.userId, actorRole: actor.role,
        source: actor.userId ? 'USER' : 'SYSTEM', contextRequestId: requestId, ...note, correlationId: (0, node_crypto_1.randomUUID)(),
    }, request_status_1.requestStateMachine);
    return transition.to;
}
async function returnToSearching(tx, history, requestId, from, actor, reasonCode) {
    await move(tx, history, requestId, from, from === 'Donor coordination' ? 'withdrawal_or_no_show' : 'more_donors_needed', actor, { reasonCode });
}
async function markDonationReported(tx, history, requestId, actor, reasonCode) {
    const state = await requestState(tx, requestId, true);
    await tx.orm
        .update(schema_1.bloodRequest)
        .set({ donationReportedAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.bloodRequest.donationReportedAt}, now())` })
        .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, requestId));
    if (state?.status !== 'Donor coordination')
        return;
    await move(tx, history, requestId, 'Donor coordination', 'attendance_reported', actor, { reasonCode });
}
async function recordFulfilment(tx, history, requestId, confirmedUnits, requestedUnits, actorUserId) {
    const full = confirmedUnits >= requestedUnits;
    return move(tx, history, requestId, 'Awaiting outcome', full ? 'record_full_outcome' : 'record_partial_outcome', { userId: actorUserId, role: 'SUP' }, { details: { confirmedUnits, requestedUnits } }, { fulfilledQuantityUnits: confirmedUnits, outcomeConfirmedAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.bloodRequest.outcomeConfirmedAt}, now())`, ...(full ? { fulfilledAt: (0, drizzle_orm_1.sql) `now()` } : {}) });
}
async function closeRequest(tx, history, requestId, from, actorUserId) {
    await move(tx, history, requestId, from, 'close', { userId: actorUserId, role: 'SUP' }, {}, { closedAt: (0, drizzle_orm_1.sql) `now()` });
}
async function declareRequestUnable(tx, history, requestId, from, reason, actorUserId) {
    await move(tx, history, requestId, from, 'declare_unable', { userId: actorUserId, role: 'SUP' }, { reasonCode: 'UNABLE_TO_FULFIL', reason }, { closedAt: (0, drizzle_orm_1.sql) `now()` });
}
//# sourceMappingURL=case-progress.js.map