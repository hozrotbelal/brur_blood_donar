import { HttpException, HttpStatus } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { Db } from '../../platform/db/database.service';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { findTransition, RequestCommand, RequestStatus, requestStateMachine } from './request-status';
import { bloodRequest } from './schema';

export interface RequestActor {
  userId: string | null;
  role: 'DON' | 'SUP' | 'SYSTEM';
}

export interface RequestState {
  status: RequestStatus;
  urgency: (typeof bloodRequest.$inferSelect)['urgency'];
  quantityUnits: number;
  areaId: string | null;
  assignedSupportUserId: string | null;
}

type Extra = Pick<PgUpdateSetSource<typeof bloodRequest>, 'fulfilledQuantityUnits' | 'outcomeConfirmedAt' | 'fulfilledAt' | 'closedAt'>;

export async function requestState(db: Db, requestId: string, lock = false): Promise<RequestState | null> {
  const query = db.orm
    .select({
      status: bloodRequest.status, urgency: bloodRequest.urgency, quantityUnits: bloodRequest.quantityUnits,
      areaId: bloodRequest.areaId, assignedSupportUserId: bloodRequest.assignedSupportUserId,
    })
    .from(bloodRequest)
    .where(eq(bloodRequest.id, requestId));
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

async function move(
  tx: Db, history: StatusHistoryService, requestId: string, from: RequestStatus, command: RequestCommand, actor: RequestActor,
  note: { reasonCode?: string; reason?: string; details?: Record<string, unknown> } = {}, extra: Extra = {},
): Promise<RequestStatus> {
  const transition = findTransition(from, command);
  if (!transition) throw new HttpException({ code: 'INVALID_TRANSITION' }, HttpStatus.UNPROCESSABLE_ENTITY);
  await tx.orm
    .update(bloodRequest)
    .set({ status: transition.to, ...extra, version: sql`${bloodRequest.version} + 1`, updatedAt: sql`now()` })
    .where(eq(bloodRequest.id, requestId));
  await history.record(
    tx,
    {
      entityType: 'BLOOD_REQUEST', entityId: requestId, from, to: transition.to, actorUserId: actor.userId, actorRole: actor.role,
      source: actor.userId ? 'USER' : 'SYSTEM', contextRequestId: requestId, ...note, correlationId: randomUUID(),
    },
    requestStateMachine,
  );
  return transition.to;
}

export async function returnToSearching(
  tx: Db, history: StatusHistoryService, requestId: string, from: 'Donor coordination' | 'Partially fulfilled', actor: RequestActor, reasonCode: string,
): Promise<void> {
  await move(tx, history, requestId, from, from === 'Donor coordination' ? 'withdrawal_or_no_show' : 'more_donors_needed', actor, { reasonCode });
}

export async function markDonationReported(tx: Db, history: StatusHistoryService, requestId: string, actor: RequestActor, reasonCode: string): Promise<void> {
  const state = await requestState(tx, requestId, true);
  await tx.orm
    .update(bloodRequest)
    .set({ donationReportedAt: sql`COALESCE(${bloodRequest.donationReportedAt}, now())` })
    .where(eq(bloodRequest.id, requestId));
  if (state?.status !== 'Donor coordination') return;
  await move(tx, history, requestId, 'Donor coordination', 'attendance_reported', actor, { reasonCode });
}

export async function recordFulfilment(tx: Db, history: StatusHistoryService, requestId: string, confirmedUnits: number, requestedUnits: number, actorUserId: string): Promise<RequestStatus> {
  const full = confirmedUnits >= requestedUnits;
  return move(
    tx, history, requestId, 'Awaiting outcome', full ? 'record_full_outcome' : 'record_partial_outcome', { userId: actorUserId, role: 'SUP' },
    { details: { confirmedUnits, requestedUnits } },
    { fulfilledQuantityUnits: confirmedUnits, outcomeConfirmedAt: sql`COALESCE(${bloodRequest.outcomeConfirmedAt}, now())`, ...(full ? { fulfilledAt: sql`now()` } : {}) },
  );
}

export async function closeRequest(tx: Db, history: StatusHistoryService, requestId: string, from: 'Fulfilled' | 'Partially fulfilled', actorUserId: string): Promise<void> {
  await move(tx, history, requestId, from, 'close', { userId: actorUserId, role: 'SUP' }, {}, { closedAt: sql`now()` });
}

export async function declareRequestUnable(tx: Db, history: StatusHistoryService, requestId: string, from: RequestStatus, reason: string, actorUserId: string): Promise<void> {
  await move(tx, history, requestId, from, 'declare_unable', { userId: actorUserId, role: 'SUP' }, { reasonCode: 'UNABLE_TO_FULFIL', reason }, { closedAt: sql`now()` });
}
