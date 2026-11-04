"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchCountsForRequest = searchCountsForRequest;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function searchCountsForRequest(db, requestId) {
    const [row] = await db.orm
        .select({
        contacted: (0, drizzle_orm_1.sql) `count(*) filter (where ${schema_1.invitation.sentAt} is not null)`.mapWith(Number),
        responded: (0, drizzle_orm_1.sql) `count(*) filter (where ${schema_1.invitation.respondedAt} is not null)`.mapWith(Number),
        willing: (0, drizzle_orm_1.sql) `count(*) filter (where ${schema_1.invitation.response} = 'Available' and ${schema_1.invitation.status} <> 'Withdrawn')`.mapWith(Number),
    })
        .from(schema_1.invitation)
        .where((0, drizzle_orm_1.eq)(schema_1.invitation.requestId, requestId));
    return { contacted: row?.contacted ?? 0, responded: row?.responded ?? 0, willing: row?.willing ?? 0 };
}
//# sourceMappingURL=read-model.public.js.map