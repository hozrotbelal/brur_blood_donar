import { HttpException, HttpStatus } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Db } from '../../platform/db/database.service';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { findTransition, requestStateMachine } from './request-status';
import { bloodRequest } from './schema';

export async function markSearching(tx: Db, history: StatusHistoryService, requestId: string, actor: string | null): Promise<void> {
  if (!findTransition('Verified', 'start_search')) throw new HttpException({ code: 'INVALID_TRANSITION' }, HttpStatus.UNPROCESSABLE_ENTITY);
  await tx.orm
    .update(bloodRequest)
    .set({ status: 'Searching', version: sql`${bloodRequest.version} + 1`, updatedAt: sql`now()` })
    .where(eq(bloodRequest.id, requestId));
  await history.record(
    tx,
    {
      entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Verified', to: 'Searching', actorUserId: actor,
      actorRole: actor ? 'SUP' : 'SYSTEM', source: actor ? 'USER' : 'SYSTEM', contextRequestId: requestId, correlationId: randomUUID(),
    },
    requestStateMachine,
  );
}

export async function markFirstWilling(tx: Db, history: StatusHistoryService, requestId: string): Promise<void> {
  const [row] = await tx.orm.select({ status: bloodRequest.status }).from(bloodRequest).where(eq(bloodRequest.id, requestId)).for('update');
  await tx.orm
    .update(bloodRequest)
    .set({ firstWillingAt: sql`COALESCE(${bloodRequest.firstWillingAt}, now())` })
    .where(eq(bloodRequest.id, requestId));
  if (row?.status !== 'Searching') return;
  await tx.orm
    .update(bloodRequest)
    .set({ status: 'Donor coordination', version: sql`${bloodRequest.version} + 1`, updatedAt: sql`now()` })
    .where(eq(bloodRequest.id, requestId));
  await history.record(
    tx,
    {
      entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Searching', to: 'Donor coordination', actorUserId: null,
      actorRole: 'SYSTEM', source: 'SYSTEM', contextRequestId: requestId, reasonCode: 'FIRST_AVAILABLE_RESPONSE', correlationId: randomUUID(),
    },
    requestStateMachine,
  );
}

export async function markFirstInvited(tx: Db, requestIds: string[]): Promise<void> {
  const unique = [...new Set(requestIds)];
  if (unique.length === 0) return;
  await tx.orm
    .update(bloodRequest)
    .set({ firstInvitedAt: sql`COALESCE(${bloodRequest.firstInvitedAt}, now())` })
    .where(inArray(bloodRequest.id, unique));
}
