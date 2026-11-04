"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestRouting = requestRouting;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function requestRouting(db, ids) {
    const unique = [...new Set(ids)];
    if (unique.length === 0)
        return new Map();
    const rows = await db.orm
        .select({ id: schema_1.bloodRequest.id, referenceNo: schema_1.bloodRequest.referenceNo, areaId: schema_1.bloodRequest.areaId, assignedSupportUserId: schema_1.bloodRequest.assignedSupportUserId })
        .from(schema_1.bloodRequest)
        .where((0, drizzle_orm_1.inArray)(schema_1.bloodRequest.id, unique));
    return new Map(rows.map(({ id, ...rest }) => [id, rest]));
}
//# sourceMappingURL=read-model.public.js.map