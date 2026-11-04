import { and, eq, inArray, sql } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { invitation } from './schema';

export async function cancelOpenInvitations(tx: Db, requestId: string): Promise<void> {
  await tx.orm
    .update(invitation)
    .set({ status: 'Cancelled', cancelledAt: sql`now()`, cancelReason: 'REQUEST_CLOSED', version: sql`${invitation.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(invitation.requestId, requestId), inArray(invitation.status, ['Queued', 'Sent', 'Delivered', 'Viewed'])));
}
