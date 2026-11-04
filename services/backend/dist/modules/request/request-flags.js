"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARED_CONTACT_PATIENTS = exports.RAPID_SUBMISSION_LIMIT = exports.DUPLICATE_WINDOW_DAYS = void 0;
exports.detectFlags = detectFlags;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const schema_1 = require("./schema");
exports.DUPLICATE_WINDOW_DAYS = 14;
exports.RAPID_SUBMISSION_LIMIT = 3;
exports.SHARED_CONTACT_PATIENTS = 3;
async function detectFlags(tx, requestId) {
    const found = [];
    const add = async (type, matched, detail) => {
        const res = await tx.orm.insert(schema_1.requestFlag).values({ requestId, flagType: type, matchedRequestId: matched, detail }).onConflictDoNothing();
        if (res.rowCount)
            found.push(type);
    };
    const r = (0, pg_core_1.alias)(schema_1.bloodRequest, 'r');
    const o = (0, pg_core_1.alias)(schema_1.bloodRequest, 'o');
    const dup = await tx.orm
        .select({ id: o.id, referenceNo: o.referenceNo })
        .from(r)
        .innerJoin(o, (0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(o.id, r.id), (0, drizzle_orm_1.sql) `${o.deletedAt} is null`, (0, drizzle_orm_1.notInArray)(o.status, ['Draft', 'Rejected', 'Cancelled', 'Closed', 'Unable to fulfil']), (0, drizzle_orm_1.eq)(o.requestedBloodGroup, r.requestedBloodGroup), (0, drizzle_orm_1.eq)(o.component, r.component), (0, drizzle_orm_1.gt)(o.createdAt, (0, drizzle_orm_1.sql) `now() - make_interval(days => ${exports.DUPLICATE_WINDOW_DAYS}::int)`), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(o.patientId, r.patientId), (0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${o.contactPhone} is not null`, (0, drizzle_orm_1.eq)(o.contactPhone, r.contactPhone)))))
        .where((0, drizzle_orm_1.eq)(r.id, requestId))
        .orderBy((0, drizzle_orm_1.desc)(o.createdAt))
        .limit(5);
    for (const d of dup)
        await add('DUPLICATE_ACTIVE', d.id, { referenceNo: d.referenceNo });
    const [rapid] = await tx.orm
        .select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) })
        .from(o)
        .innerJoin(r, (0, drizzle_orm_1.eq)(r.createdByUserId, o.createdByUserId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(r.id, requestId), (0, drizzle_orm_1.gt)(o.submittedAt, (0, drizzle_orm_1.sql) `now() - interval '24 hours'`), (0, drizzle_orm_1.ne)(o.id, r.id)));
    if (rapid.n >= exports.RAPID_SUBMISSION_LIMIT)
        await add('RAPID_SUBMISSION', null, { submittedLast24h: rapid.n + 1 });
    const [shared] = await tx.orm
        .select({ n: (0, drizzle_orm_1.sql) `count(distinct ${o.patientId})`.mapWith(Number) })
        .from(r)
        .innerJoin(o, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(o.contactPhone, r.contactPhone), (0, drizzle_orm_1.gt)(o.createdAt, (0, drizzle_orm_1.sql) `now() - interval '7 days'`)))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(r.id, requestId), (0, drizzle_orm_1.sql) `${r.contactPhone} is not null`));
    if (shared.n >= exports.SHARED_CONTACT_PATIENTS)
        await add('SHARED_CONTACT', null, { patients: shared.n });
    return found;
}
//# sourceMappingURL=request-flags.js.map