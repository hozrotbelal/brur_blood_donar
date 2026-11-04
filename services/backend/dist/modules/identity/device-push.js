"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setPushToken = setPushToken;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function setPushToken(db, userId, installId, token) {
    const rows = await db.orm
        .update(schema_1.device)
        .set({ pushToken: token, lastSeenAt: (0, drizzle_orm_1.sql) `now()`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.device.userId, userId), (0, drizzle_orm_1.eq)(schema_1.device.installId, installId), (0, drizzle_orm_1.eq)(schema_1.device.signOutStatus, 'Active')))
        .returning({ id: schema_1.device.id });
    return rows.length > 0;
}
//# sourceMappingURL=device-push.js.map