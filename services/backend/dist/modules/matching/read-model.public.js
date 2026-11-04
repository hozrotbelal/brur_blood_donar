"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchCountsForRequest = searchCountsForRequest;
exports.searchCountsByActor = searchCountsByActor;
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
async function searchCountsByActor(db, userIds, from, to) {
    if (userIds.length === 0)
        return new Map();
    const rows = await db.orm
        .select({ userId: schema_1.searchEvent.actorUserId, n: (0, drizzle_orm_1.count)() })
        .from(schema_1.searchEvent)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.searchEvent.actorUserId, userIds), (0, drizzle_orm_1.gte)(schema_1.searchEvent.occurredAt, from), (0, drizzle_orm_1.lt)(schema_1.searchEvent.occurredAt, to)))
        .groupBy(schema_1.searchEvent.actorUserId);
    return new Map(rows.map((r) => [r.userId, r.n]));
}
//# sourceMappingURL=read-model.public.js.map