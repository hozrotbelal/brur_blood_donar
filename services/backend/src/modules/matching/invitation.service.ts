import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, inArray, notExists, notInArray, sql } from 'drizzle-orm';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { CaseService } from '../case-workflow/case-workflow.public';
import { touchDonorResponse } from '../identity/identity.public';
import { donorProfileIdOf } from '../identity/read-model.public';
import { markFirstInvited, markFirstWilling } from '../request/request.public';
import { responseWindowMinutes, Urgency } from './matching.rules';
import { RespondDto, WithdrawInvitationDto } from './invitation.dto';
import { invitation, invitationResponse, matchRun } from './schema';

const COLUMNS = {
  id: invitation.id, requestId: invitation.requestId, status: invitation.status, response: invitation.response, expiresAt: invitation.expiresAt,
  sentAt: invitation.sentAt, viewedAt: invitation.viewedAt, respondedAt: invitation.respondedAt, payloadSnapshot: invitation.payloadSnapshot,
  donorProfileId: invitation.donorProfileId,
};

type InvitationRow = {
  id: string;
  requestId: string;
  status: (typeof invitation.$inferSelect)['status'];
  response: (typeof invitation.$inferSelect)['response'];
  expiresAt: Date;
  sentAt: Date | null;
  viewedAt: Date | null;
  respondedAt: Date | null;
  payloadSnapshot: unknown;
  donorProfileId: string;
};

type WithdrawalReason = NonNullable<(typeof invitationResponse.$inferInsert)['withdrawalReason']>;

const OPEN = ['Sent', 'Delivered', 'Viewed'];
const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

@Injectable()
export class InvitationService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
    private readonly cases: CaseService,
  ) {}

  async list(principal: Principal) {
    const donorProfileId = await donorProfileIdOf(this.db, principal.userId);
    if (!donorProfileId) return [];
    const rows = await this.db.orm
      .select(COLUMNS)
      .from(invitation)
      .where(and(
        eq(invitation.donorProfileId, donorProfileId), inArray(invitation.status, ['Sent', 'Delivered', 'Viewed', 'Responded', 'Expired']),
        gt(invitation.sentAt, sql`now() - interval '30 days'`),
      ))
      .orderBy(desc(invitation.sentAt))
      .limit(50);
    return rows.map(view);
  }

  async open(principal: Principal, id: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.lock(tx, principal, id);
      if (OPEN.slice(0, 2).includes(row.status) && row.expiresAt.getTime() > Date.now()) {
        await tx.orm
          .update(invitation)
          .set({ status: 'Viewed', viewedAt: sql`now()`, version: sql`${invitation.version} + 1`, updatedAt: sql`now()` })
          .where(eq(invitation.id, id));
        return view({ ...row, status: 'Viewed', viewedAt: new Date() });
      }
      return view(row);
    });
  }

  async respond(principal: Principal, id: string, dto: RespondDto) {
    if (dto.response === 'Later' && !dto.laterAvailableAt) throw fail('LATER_TIME_REQUIRED');
    const later = dto.laterAvailableAt ? new Date(dto.laterAvailableAt) : null;
    if (later && later.getTime() <= Date.now()) throw fail('LATER_TIME_IN_PAST');
    return this.db.transaction(async (tx) => {
      const row = await this.lock(tx, principal, id);
      if (dto.clientMutationId) {
        const [seen] = await tx.orm
          .select({ id: invitationResponse.id })
          .from(invitationResponse)
          .where(and(eq(invitationResponse.invitationId, id), eq(invitationResponse.clientMutationId, dto.clientMutationId)));
        if (seen) return view(row);
      }
      if (!OPEN.includes(row.status) || row.expiresAt.getTime() <= Date.now()) throw fail('INVITATION_CLOSED', HttpStatus.GONE);

      await tx.orm.insert(invitationResponse).values({
        invitationId: id, responseValue: dto.response, laterAvailableAt: later, channel: 'IN_APP', clientMutationId: dto.clientMutationId ?? null,
      });
      await tx.orm
        .update(invitation)
        .set({ status: 'Responded', response: dto.response, respondedAt: sql`now()`, laterRecheckAt: later, version: sql`${invitation.version} + 1`, updatedAt: sql`now()` })
        .where(eq(invitation.id, id));
      await touchDonorResponse(tx, row.donorProfileId);
      if (dto.response === 'Available') {
        await markFirstWilling(tx, this.history, row.requestId);
        await this.cases.linkAvailableDonor(tx, { requestId: row.requestId, invitationId: id, donorProfileId: row.donorProfileId });
      }
      await this.outbox.append(tx, {
        aggregateType: 'INVITATION', aggregateId: id, eventType: 'InvitationResponded', payload: { response: dto.response, requestId: row.requestId },
      });
      return view({ ...row, status: 'Responded', response: dto.response, respondedAt: new Date() });
    });
  }

  async withdraw(principal: Principal, id: string, dto: WithdrawInvitationDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.lock(tx, principal, id);
      if (row.status === 'Withdrawn') return view(row);
      if (row.status !== 'Responded' || row.response !== 'Available') throw fail('INVALID_TRANSITION');
      await tx.orm.insert(invitationResponse).values({ invitationId: id, responseValue: null, isWithdrawal: true, withdrawalReason: dto.reason as WithdrawalReason, channel: 'IN_APP' });
      await tx.orm
        .update(invitation)
        .set({ status: 'Withdrawn', withdrawnAt: sql`now()`, version: sql`${invitation.version} + 1`, updatedAt: sql`now()` })
        .where(eq(invitation.id, id));
      await this.cases.handleDonorLeft(tx, { invitationId: id, kind: 'WITHDRAWN', actorUserId: principal.userId, actorRole: 'DON' });
      await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: id, eventType: 'InvitationWithdrawn', payload: { requestId: row.requestId } });
      return view({ ...row, status: 'Withdrawn' });
    });
  }

  async cancelForEndedRequests(limit = 200): Promise<number> {
    // Raw SQL: selects by request status in another module (ADR-16 rule 6).
    const res = await this.db.query(
      `UPDATE src.invitation SET status = 'Cancelled', cancelled_at = now(), cancel_reason = 'REQUEST_CLOSED', version = version + 1, updated_at = now()
        WHERE id IN (SELECT i.id FROM src.invitation i JOIN req.blood_request r ON r.id = i.request_id
                      WHERE i.status IN ('Queued','Sent','Delivered','Viewed') AND r.status IN ('Cancelled','Rejected','Unable to fulfil','Closed') LIMIT $1)`,
      [limit],
    );
    return res.rowCount ?? 0;
  }

  async dispatchDue(limit = 100): Promise<number> {
    return this.db.transaction(async (tx) => {
      // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
      const due = await tx.query<{ id: string; request_id: string; match_run_id: string }>(
        `SELECT i.id, i.request_id, i.match_run_id FROM src.invitation i JOIN req.blood_request r ON r.id = i.request_id
          WHERE i.status = 'Queued' AND i.queued_at <= now() AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          ORDER BY i.queued_at LIMIT $1 FOR UPDATE OF i SKIP LOCKED`,
        [limit],
      );
      for (const i of due.rows) {
        await tx.orm
          .update(invitation)
          .set({ status: 'Sent', sentAt: sql`now()`, version: sql`${invitation.version} + 1`, updatedAt: sql`now()` })
          .where(eq(invitation.id, i.id));
        await markFirstInvited(tx, [i.request_id]);
        await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationSent', payload: { requestId: i.request_id } });
      }
      const runs = [...new Set(due.rows.map((i) => i.match_run_id))];
      if (runs.length > 0) {
        const queued = tx.orm.select({ id: invitation.id }).from(invitation).where(and(eq(invitation.matchRunId, matchRun.id), eq(invitation.status, 'Queued')));
        await tx.orm
          .update(matchRun)
          .set({ status: 'Awaiting responses', version: sql`${matchRun.version} + 1`, updatedAt: sql`now()` })
          .where(and(inArray(matchRun.id, runs), eq(matchRun.status, 'Dispatching'), notExists(queued)));
      }
      return due.rows.length;
    });
  }

  async expireDue(limit = 200): Promise<number> {
    return this.db.transaction(async (tx) => {
      // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
      const expired = await tx.query<{ id: string; request_id: string }>(
        `UPDATE src.invitation SET status = 'Expired', expired_at = now(), version = version + 1, updated_at = now()
          WHERE id IN (SELECT id FROM src.invitation WHERE status IN ('Sent','Delivered','Viewed') AND expires_at <= now()
                        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)
          RETURNING id, request_id`,
        [limit],
      );
      for (const i of expired.rows) {
        await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationExpired', payload: { requestId: i.request_id } });
      }
      return expired.rows.length;
    });
  }

  async reaskDue(limit = 100): Promise<number> {
    return this.db.transaction(async (tx) => {
      // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
      const due = await tx.query<{ id: string; request_id: string; urgency: string }>(
        `SELECT i.id, i.request_id, r.urgency::text AS urgency
           FROM src.invitation i
           JOIN req.blood_request r ON r.id = i.request_id
           JOIN idn.donor_profile d ON d.id = i.donor_profile_id
          WHERE i.status = 'Responded' AND i.response = 'Later' AND i.later_recheck_at <= now() AND COALESCE(i.reask_count, 0) < 1
            AND r.status IN ('Verified','Searching','Donor coordination') AND r.required_by > now() AND r.deleted_at IS NULL
            AND NOT r.outreach_paused AND NOT r.has_moderation_hold
            AND d.donor_status = 'Active'
          ORDER BY i.later_recheck_at LIMIT $1 FOR UPDATE OF i SKIP LOCKED`,
        [limit],
      );
      for (const i of due.rows) {
        await tx.orm
          .update(invitation)
          .set({
            status: 'Sent', response: null, respondedAt: null, sentAt: sql`now()`, laterRecheckAt: null, reaskCount: sql`COALESCE(${invitation.reaskCount}, 0) + 1`,
            expiresAt: sql`now() + make_interval(mins => ${responseWindowMinutes(i.urgency as Urgency)}::int)`, version: sql`${invitation.version} + 1`, updatedAt: sql`now()`,
          })
          .where(eq(invitation.id, i.id));
        await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationSent', payload: { requestId: i.request_id, reask: true } });
      }
      return due.rows.length;
    });
  }

  private async lock(tx: Db, principal: Principal, id: string): Promise<InvitationRow> {
    const donorProfileId = await donorProfileIdOf(tx, principal.userId);
    if (!donorProfileId) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    const [row] = await tx.orm
      .select(COLUMNS)
      .from(invitation)
      .where(and(eq(invitation.id, id), eq(invitation.donorProfileId, donorProfileId), notInArray(invitation.status, ['Queued', 'Cancelled'])))
      .for('update');
    if (!row) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    return row;
  }
}

function view(r: InvitationRow) {
  const closed = r.status === 'Expired' || r.status === 'Cancelled' || r.status === 'Withdrawn';
  return {
    id: r.id,
    status: r.status,
    response: r.response,
    expiresAt: r.expiresAt,
    sentAt: r.sentAt,
    respondedAt: r.respondedAt,
    details: closed ? null : r.payloadSnapshot,
    notice: 'The collection service will check whether you are able to donate.',
  };
}
