import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { appUser, consentRecord, device, notificationPreference } from './schema';

export type UiLanguage = (typeof appUser.$inferSelect)['preferredLanguage'];
export type NotificationCategory = (typeof notificationPreference.$inferSelect)['category'];

export interface ChannelPreference {
  pushEnabled: boolean;
  smsEnabled: boolean;
  inappEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
}

export async function preferredLanguage(db: Db, userId: string): Promise<UiLanguage | null> {
  const [row] = await db.orm
    .select({ language: appUser.preferredLanguage })
    .from(appUser)
    .where(and(eq(appUser.id, userId), isNull(appUser.deletedAt)));
  return row?.language ?? null;
}

export async function phoneOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.orm.select({ phone: appUser.phoneE164 }).from(appUser).where(eq(appUser.id, userId));
  return row?.phone ?? null;
}

export async function activePushDevices(db: Db, userId: string): Promise<{ pushToken: string; platform: string }[]> {
  const rows = await db.orm
    .select({ pushToken: device.pushToken, platform: device.platform })
    .from(device)
    .where(and(eq(device.userId, userId), isNotNull(device.pushToken), eq(device.signOutStatus, 'Active'), isNull(device.revokedAt)));
  return rows.map((r) => ({ pushToken: r.pushToken as string, platform: r.platform }));
}

export async function channelPreference(db: Db, userId: string, category: NotificationCategory): Promise<ChannelPreference | null> {
  const [row] = await db.orm
    .select({
      pushEnabled: notificationPreference.pushEnabled,
      smsEnabled: notificationPreference.smsEnabled,
      inappEnabled: notificationPreference.inappEnabled,
      quietStart: notificationPreference.quietStart,
      quietEnd: notificationPreference.quietEnd,
    })
    .from(notificationPreference)
    .where(and(eq(notificationPreference.userId, userId), eq(notificationPreference.category, category)));
  return row ?? null;
}

export async function hasSmsChannelConsent(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: consentRecord.id })
    .from(consentRecord)
    .where(and(eq(consentRecord.userId, userId), eq(consentRecord.consentType, 'CHANNEL_SMS'), eq(consentRecord.granted, true), isNull(consentRecord.withdrawnAt)))
    .limit(1);
  return row !== undefined;
}
