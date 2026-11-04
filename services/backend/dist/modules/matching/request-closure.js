"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOpenInvitations = cancelOpenInvitations;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function cancelOpenInvitations(tx, requestId) {
    await tx.orm
        .update(schema_1.invitation)
        .set({ status: 'Cancelled', cancelledAt: (0, drizzle_orm_1.sql) `now()`, cancelReason: 'REQUEST_CLOSED', version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invitation.requestId, requestId), (0, drizzle_orm_1.inArray)(schema_1.invitation.status, ['Queued', 'Sent', 'Delivered', 'Viewed'])));
}
//# sourceMappingURL=request-closure.js.map