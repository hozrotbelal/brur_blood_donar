"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferredLanguage = preferredLanguage;
exports.phoneOf = phoneOf;
exports.activePushDevices = activePushDevices;
exports.channelPreference = channelPreference;
exports.hasSmsChannelConsent = hasSmsChannelConsent;
exports.donorLabels = donorLabels;
exports.donorProfileIdOf = donorProfileIdOf;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
async function preferredLanguage(db, userId) {
    const [row] = await db.orm
        .select({ language: schema_1.appUser.preferredLanguage })
        .from(schema_1.appUser)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, userId), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)));
    return row?.language ?? null;
}
async function phoneOf(db, userId) {
    const [row] = await db.orm.select({ phone: schema_1.appUser.phoneE164 }).from(schema_1.appUser).where((0, drizzle_orm_1.eq)(schema_1.appUser.id, userId));
    return row?.phone ?? null;
}
async function activePushDevices(db, userId) {
    const rows = await db.orm
        .select({ pushToken: schema_1.device.pushToken, platform: schema_1.device.platform })
        .from(schema_1.device)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.device.userId, userId), (0, drizzle_orm_1.isNotNull)(schema_1.device.pushToken), (0, drizzle_orm_1.eq)(schema_1.device.signOutStatus, 'Active'), (0, drizzle_orm_1.isNull)(schema_1.device.revokedAt)));
    return rows.map((r) => ({ pushToken: r.pushToken, platform: r.platform }));
}
async function channelPreference(db, userId, category) {
    const [row] = await db.orm
        .select({
        pushEnabled: schema_1.notificationPreference.pushEnabled,
        smsEnabled: schema_1.notificationPreference.smsEnabled,
        inappEnabled: schema_1.notificationPreference.inappEnabled,
        quietStart: schema_1.notificationPreference.quietStart,
        quietEnd: schema_1.notificationPreference.quietEnd,
    })
        .from(schema_1.notificationPreference)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notificationPreference.userId, userId), (0, drizzle_orm_1.eq)(schema_1.notificationPreference.category, category)));
    return row ?? null;
}
async function hasSmsChannelConsent(db, userId) {
    const [row] = await db.orm
        .select({ id: schema_1.consentRecord.id })
        .from(schema_1.consentRecord)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.consentRecord.userId, userId), (0, drizzle_orm_1.eq)(schema_1.consentRecord.consentType, 'CHANNEL_SMS'), (0, drizzle_orm_1.eq)(schema_1.consentRecord.granted, true), (0, drizzle_orm_1.isNull)(schema_1.consentRecord.withdrawnAt)))
        .limit(1);
    return row !== undefined;
}
async function donorLabels(db, donorProfileIds) {
    const unique = [...new Set(donorProfileIds)];
    if (unique.length === 0)
        return new Map();
    const rows = await db.orm
        .select({ id: schema_1.donorProfile.id, donorCode: schema_1.donorProfile.donorCode, bloodGroup: schema_1.donorProfile.bloodGroup })
        .from(schema_1.donorProfile)
        .where((0, drizzle_orm_1.inArray)(schema_1.donorProfile.id, unique));
    return new Map(rows.map(({ id, ...rest }) => [id, rest]));
}
async function donorProfileIdOf(db, userId) {
    const [row] = await db.orm.select({ id: schema_1.donorProfile.id }).from(schema_1.donorProfile).where((0, drizzle_orm_1.eq)(schema_1.donorProfile.userId, userId));
    return row?.id ?? null;
}
//# sourceMappingURL=read-model.public.js.map