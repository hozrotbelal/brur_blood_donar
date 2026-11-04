"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeGlobalSettings = activeGlobalSettings;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function activeGlobalSettings(db, keys) {
    if (keys.length === 0)
        return new Map();
    const rows = await db.orm
        .selectDistinctOn([schema_1.configSetting.key], { key: schema_1.configSetting.key, value: schema_1.configSetting.value })
        .from(schema_1.configSetting)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.configSetting.key, keys), (0, drizzle_orm_1.eq)(schema_1.configSetting.status, 'Active'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.configSetting.scopeType), (0, drizzle_orm_1.eq)(schema_1.configSetting.scopeType, 'GLOBAL'))))
        .orderBy(schema_1.configSetting.key, (0, drizzle_orm_1.desc)(schema_1.configSetting.version));
    return new Map(rows.map((r) => [r.key, r.value]));
}
//# sourceMappingURL=read-model.public.js.map