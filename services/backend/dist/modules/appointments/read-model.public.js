"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.facilityNames = facilityNames;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function facilityNames(db, ids) {
    const unique = [...new Set(ids)];
    if (unique.length === 0)
        return new Map();
    const rows = await db.orm.select({ id: schema_1.facility.id, nameEn: schema_1.facility.nameEn, nameBn: schema_1.facility.nameBn }).from(schema_1.facility).where((0, drizzle_orm_1.inArray)(schema_1.facility.id, unique));
    return new Map(rows.map((row) => [row.id, { nameEn: row.nameEn, nameBn: row.nameBn }]));
}
//# sourceMappingURL=read-model.public.js.map