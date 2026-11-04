import { and, eq, sql } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { device } from './schema';

export async function setPushToken(db: Db, userId: string, installId: string, token: string): Promise<boolean> {
  const rows = await db.orm
    .update(device)
    .set({ pushToken: token, lastSeenAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(device.userId, userId), eq(device.installId, installId), eq(device.signOutStatus, 'Active')))
    .returning({ id: device.id });
  return rows.length > 0;
}
