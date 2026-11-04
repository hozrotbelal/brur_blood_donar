"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.touchDonorResponse = touchDonorResponse;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function touchDonorResponse(tx, donorProfileId) {
    await tx.orm
        .update(schema_1.donorProfile)
        .set({ lastResponseAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.donorProfile.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.eq)(schema_1.donorProfile.id, donorProfileId));
}
//# sourceMappingURL=donor-activity.js.map