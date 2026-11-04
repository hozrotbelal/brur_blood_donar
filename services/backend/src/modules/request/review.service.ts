import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { PolicyService } from '../../platform/policy/policy.service';
import { PermissionScope, Principal, SCOPE_ORDER } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { maskPhone } from '../identity/identity.public';
import { RequestCommand, RequestStatus, canActorRun, findTransition, requestStateMachine } from './request-status';
import { UPDATABLE_STATUSES } from './request-changes';
import { DecideChangeDto, RejectChangeDto, RejectRequestDto, ResolveFlagDto, RequestInformationDto, VerifyRequestDto } from './review.dto';
import { bloodRequest, patient, requestChange, requestFlag } from './schema';
import { alias } from 'drizzle-orm/pg-core';

const reviewColumns = {
  id: bloodRequest.id, referenceNo: bloodRequest.referenceNo, patientId: bloodRequest.patientId, patientName: patient.displayName,
  requestedBloodGroup: bloodRequest.requestedBloodGroup, component: bloodRequest.component, quantityUnits: bloodRequest.quantityUnits, requiredBy: bloodRequest.requiredBy,
  urgency: bloodRequest.urgency, priority: bloodRequest.priority, status: bloodRequest.status, areaId: bloodRequest.areaId, contactPhone: bloodRequest.contactPhone,
  hasModerationHold: bloodRequest.hasModerationHold, assignedSupportUserId: bloodRequest.assignedSupportUserId, submittedAt: bloodRequest.submittedAt,
  firstActionAt: bloodRequest.firstActionAt, version: bloodRequest.version,
};

type ReviewRow = Omit<Pick<typeof bloodRequest.$inferSelect, Exclude<keyof typeof reviewColumns, 'patientName'>>, 'status'> & { patientName: string; status: RequestStatus };
type RequestStatusValue = (typeof bloodRequest.$inferSelect)['status'];
type FlagResolution = (typeof requestFlag.$inferSelect)['status'];

const REVIEW_STATUSES: RequestStatusValue[] = ['Submitted', 'Under review', 'Needs information'];

export interface RequestFlagView {
  id: string;
  flagType: string;
  matchedRequestId: string | null;
  matchedReferenceNo: string | null;
  detail: unknown;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

export function widestScope(principal: Principal, key: string): PermissionScope | null {
  const now = Date.now();
  const scopes = principal.grants.filter((g) => g.key === key && (!g.expiresAt || g.expiresAt.getTime() > now)).map((g) => g.scope);
  if (scopes.length === 0) return null;
  return scopes.reduce((a, b) => (SCOPE_ORDER.indexOf(a) >= SCOPE_ORDER.indexOf(b) ? a : b));
}

export function checklistGaps(dto: VerifyRequestDto): string[] {
  const labels: Record<keyof VerifyRequestDto, string> = {
    documentLegible: 'DOCUMENT_LEGIBLE',
    bloodGroupAndComponentMatch: 'BLOOD_GROUP_AND_COMPONENT_MATCH',
    facilityExists: 'FACILITY_EXISTS',
    representativeReachable: 'REPRESENTATIVE_REACHABLE',
    noDuplicate: 'NO_DUPLICATE',
    urgencyConsistent: 'URGENCY_CONSISTENT',
  };
  return (Object.keys(labels) as (keyof VerifyRequestDto)[]).filter((k) => dto[k] !== true).map((k) => labels[k]);
}

@Injectable()
export class ReviewService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
  ) {}

  async queue(principal: Principal, status?: string) {
    const scope = widestScope(principal, 'blood_request.view');
    if (!scope) return [];
    const areas = await staffAreaIds(this.db, principal.userId);
    const visible =
      scope === 'All'
        ? undefined
        : scope === 'Area'
          ? or(eq(bloodRequest.assignedSupportUserId, principal.userId), areas.length ? inArray(bloodRequest.areaId, areas) : sql`false`)
          : eq(bloodRequest.assignedSupportUserId, principal.userId);
    const rows = await this.db.orm
      .select(reviewColumns)
      .from(bloodRequest)
      .innerJoin(patient, eq(patient.id, bloodRequest.patientId))
      .where(and(inArray(bloodRequest.status, status ? [status as RequestStatusValue] : REVIEW_STATUSES), isNull(bloodRequest.deletedAt), visible))
      .orderBy(desc(sql`(${bloodRequest.urgency} = 'Critical')`), desc(sql`(${bloodRequest.urgency} = 'Urgent')`), asc(bloodRequest.requiredBy))
      .limit(100);
    return rows.map((r) => toReviewView(r as ReviewRow));
  }

  async detail(principal: Principal, id: string) {
    const row = await this.load(this.db, id, false);
    await this.requireView(this.db, principal, row);
    return { ...toReviewView(row), flags: await this.flags(id), changes: await this.changes(this.db, id) };
  }

  async changes(db: Db, requestId: string) {
    return db.orm
      .select({
        id: requestChange.id, changeType: requestChange.changeType, isMaterial: requestChange.isMaterial, status: requestChange.status,
        proposedValues: requestChange.proposedValues, previousValues: requestChange.previousValues, createdAt: requestChange.createdAt,
      })
      .from(requestChange)
      .where(eq(requestChange.requestId, requestId))
      .orderBy(desc(requestChange.createdAt));
  }

  async approveChange(principal: Principal, id: string, changeId: string, dto: DecideChangeDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, id, true);
      await this.requireApprove(tx, principal, row);
      const change = await this.lockPendingChange(tx, id, changeId);
      if (!UPDATABLE_STATUSES.includes(row.status)) throw fail('UPDATE_NOT_ALLOWED');
      const values = { ...(change.proposedValues as Record<string, unknown>) };
      if (typeof values.requiredBy === 'string') {
        const requiredBy = new Date(values.requiredBy);
        if (requiredBy.getTime() <= Date.now()) throw fail('REQUIRED_BY_IN_PAST');
        values.requiredBy = requiredBy;
      }
      await tx.orm
        .update(bloodRequest)
        .set({ ...(values as Partial<typeof bloodRequest.$inferInsert>), version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() })
        .where(eq(bloodRequest.id, id));
      await this.decide(tx, principal, row, change.id, 'Approved', change.changeType, dto.note);
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestChangeApproved',
        payload: { changeId: change.id, changeType: change.changeType, requestStatus: row.status },
        version: row.version + 1,
      });
      return { ...toReviewView(await this.load(tx, id, false)), flags: await this.flags(id), changes: await this.changes(tx, id) };
    });
  }

  async rejectChange(principal: Principal, id: string, changeId: string, dto: RejectChangeDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, id, true);
      await this.requireApprove(tx, principal, row);
      const change = await this.lockPendingChange(tx, id, changeId);
      await this.decide(tx, principal, row, change.id, 'Rejected', change.changeType, dto.reason);
      await tx.orm.update(bloodRequest).set({ version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() }).where(eq(bloodRequest.id, id));
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestChangeRejected', payload: { changeId: change.id, changeType: change.changeType },
        version: row.version + 1,
      });
      return { ...toReviewView(await this.load(tx, id, false)), flags: await this.flags(id), changes: await this.changes(tx, id) };
    });
  }

  private async lockPendingChange(tx: Db, requestId: string, changeId: string) {
    const [change] = await tx.orm
      .select({ id: requestChange.id, status: requestChange.status, changeType: requestChange.changeType, proposedValues: requestChange.proposedValues })
      .from(requestChange)
      .where(and(eq(requestChange.id, changeId), eq(requestChange.requestId, requestId)))
      .for('update');
    if (!change) throw new NotFoundException({ code: 'CHANGE_NOT_FOUND' });
    if (change.status !== 'Pending') throw fail('CHANGE_NOT_PENDING', HttpStatus.CONFLICT);
    return change;
  }

  private async decide(tx: Db, principal: Principal, row: ReviewRow, changeId: string, to: 'Approved' | 'Rejected', changeType: string, reason?: string) {
    await tx.orm
      .update(requestChange)
      .set({ status: to, decidedBy: principal.userId, version: sql`${requestChange.version} + 1`, updatedAt: new Date() })
      .where(eq(requestChange.id, changeId));
    await this.history.record(tx, {
      entityType: 'REQUEST_CHANGE', entityId: changeId, from: 'Pending', to, actorUserId: principal.userId,
      actorRole: principal.role === 'MOD' ? 'MOD' : 'SUP', source: 'USER', contextRequestId: row.id, reasonCode: changeType, reason,
      correlationId: randomUUID(),
    });
  }

  async flags(requestId: string): Promise<RequestFlagView[]> {
    const matched = alias(bloodRequest, 'm');
    return this.db.orm
      .select({
        id: requestFlag.id, flagType: requestFlag.flagType, matchedRequestId: requestFlag.matchedRequestId, matchedReferenceNo: matched.referenceNo, detail: requestFlag.detail,
        status: requestFlag.status, createdAt: requestFlag.createdAt, resolvedAt: requestFlag.resolvedAt, resolutionNote: requestFlag.resolutionNote,
      })
      .from(requestFlag)
      .leftJoin(matched, eq(matched.id, requestFlag.matchedRequestId))
      .where(eq(requestFlag.requestId, requestId))
      .orderBy(asc(requestFlag.createdAt));
  }

  async resolveFlag(principal: Principal, requestId: string, flagId: string, dto: ResolveFlagDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, requestId, true);
      await this.requireApprove(tx, principal, row);
      const res = await tx.orm
        .update(requestFlag)
        .set({ status: dto.resolution as FlagResolution, resolvedBy: principal.userId, resolvedAt: new Date(), resolutionNote: dto.note })
        .where(and(eq(requestFlag.id, flagId), eq(requestFlag.requestId, requestId), eq(requestFlag.status, 'Open')));
      if (!res.rowCount) throw new NotFoundException({ code: 'FLAG_NOT_FOUND' });
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: requestId, eventType: 'RequestFlagResolved', payload: { flagId, resolution: dto.resolution },
      });
      return { flagId, status: dto.resolution };
    });
  }

  async pickUp(principal: Principal, id: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, id, true);
      await this.requireView(tx, principal, row);
      if (row.assignedSupportUserId === principal.userId && row.status === 'Under review') return toReviewView(row);
      if (row.assignedSupportUserId && row.assignedSupportUserId !== principal.userId) throw fail('ALREADY_PICKED_UP', HttpStatus.CONFLICT);
      this.transition(row, 'pick_up', principal);
      await tx.orm
        .update(bloodRequest)
        .set({
          status: 'Under review', assignedSupportUserId: principal.userId, firstActionAt: sql`coalesce(${bloodRequest.firstActionAt}, now())`,
          version: sql`${bloodRequest.version} + 1`, updatedAt: new Date(),
        })
        .where(eq(bloodRequest.id, id));
      await tx.query(
        `INSERT INTO crd.case_task (request_id, task_type, status, assignee_user_id, dedupe_key)
         VALUES ($1, 'TK_VERIFY_REQUEST', 'In progress', $2, $3) ON CONFLICT DO NOTHING`,
        [id, principal.userId, `verify:${id}`],
      );
      await this.after(tx, principal, row, 'Under review', 'RequestPickedUp');
      return toReviewView(await this.load(tx, id, false));
    });
  }

  async requestInformation(principal: Principal, id: string, dto: RequestInformationDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, id, true);
      await this.requireApprove(tx, principal, row);
      this.transition(row, 'request_information', principal);
      await tx.orm.update(bloodRequest).set({ status: 'Needs information', version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() }).where(eq(bloodRequest.id, id));
      await this.after(tx, principal, row, 'Needs information', 'RequestInformationRequested', {
        reasonCode: 'MISSING_INFORMATION', reason: dto.message, details: { missingItems: dto.items },
      });
      return toReviewView(await this.load(tx, id, false));
    });
  }

  async verify(principal: Principal, id: string, dto: VerifyRequestDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, id, true);
      await this.requireApprove(tx, principal, row);
      this.transition(row, 'verify', principal);
      if (row.hasModerationHold) throw fail('MODERATION_REVIEW_IN_PROGRESS');
      const [open] = await tx.orm.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(requestFlag).where(and(eq(requestFlag.requestId, id), eq(requestFlag.status, 'Open')));
      if (open.n > 0) throw fail('UNRESOLVED_FLAGS');
      const gaps = checklistGaps(dto);
      if (gaps.length > 0) throw new HttpException({ code: 'CHECKLIST_INCOMPLETE', missing: gaps }, HttpStatus.UNPROCESSABLE_ENTITY);
      await tx.orm
        .update(bloodRequest)
        .set({ status: 'Verified', verifiedAt: new Date(), version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() })
        .where(eq(bloodRequest.id, id));
      await this.completeTask(tx, id, principal.userId);
      await this.after(tx, principal, row, 'Verified', 'RequestVerified', { details: { checklist: dto } });
      return toReviewView(await this.load(tx, id, false));
    });
  }

  async reject(principal: Principal, id: string, dto: RejectRequestDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, id, true);
      if (principal.role === 'MOD') await this.requireModerationReject(principal, row);
      else await this.requireApprove(tx, principal, row);
      this.transition(row, 'reject', principal);
      await tx.orm.update(bloodRequest).set({ status: 'Rejected', version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() }).where(eq(bloodRequest.id, id));
      await this.completeTask(tx, id, principal.userId);
      await this.after(tx, principal, row, 'Rejected', 'RequestRejected', { reasonCode: dto.reasonCode, reason: dto.explanation });
      return toReviewView(await this.load(tx, id, false));
    });
  }

  private transition(row: ReviewRow, command: RequestCommand, principal: Principal) {
    const t = findTransition(row.status, command);
    const actor = principal.role === 'SUP' || principal.role === 'MOD' ? principal.role : null;
    if (!t || !actor || !canActorRun(t, actor, row.status)) throw fail('INVALID_TRANSITION');
  }

  private async after(
    tx: Db, principal: Principal, row: ReviewRow, to: RequestStatus, event: string,
    extra: { reasonCode?: string; reason?: string; details?: Record<string, unknown> } = {},
  ) {
    await this.history.record(
      tx,
      {
        entityType: 'BLOOD_REQUEST', entityId: row.id, from: row.status, to, actorUserId: principal.userId,
        actorRole: principal.role === 'MOD' ? 'MOD' : 'SUP', source: 'USER', contextRequestId: row.id,
        reasonCode: extra.reasonCode, reason: extra.reason, details: extra.details, correlationId: randomUUID(),
      },
      requestStateMachine,
    );
    await this.outbox.append(tx, {
      aggregateType: 'BLOOD_REQUEST', aggregateId: row.id, eventType: event,
      payload: { from: row.status, to, ...(extra.reasonCode ? { reasonCode: extra.reasonCode } : {}), ...(extra.details ?? {}) },
      version: row.version + 1,
    });
  }

  private completeTask(tx: Db, requestId: string, userId: string) {
    return tx.query(
      `UPDATE crd.case_task SET status = 'Done', completed_by = $2, completed_at = now(), version = version + 1, updated_at = now()
        WHERE request_id = $1 AND task_type = 'TK_VERIFY_REQUEST' AND status <> 'Done'`,
      [requestId, userId],
    );
  }

  private async requireView(db: Db, principal: Principal, row: ReviewRow) {
    const decision = this.policy.decide(principal, 'blood_request.view', {
      resource: { assignedUserIds: row.assignedSupportUserId ? [row.assignedSupportUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
      principalAreaIds: await staffAreaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
  }

  private async requireApprove(db: Db, principal: Principal, row: ReviewRow) {
    await this.requireView(db, principal, row);
    const decision = this.policy.decide(principal, 'blood_request.approve', {
      resource: { assignedUserIds: row.assignedSupportUserId ? [row.assignedSupportUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
      principalAreaIds: await staffAreaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
  }

  private async requireModerationReject(principal: Principal, row: ReviewRow) {
    if (!widestScope(principal, 'blood_request.reject_moderation')) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    if (!row.hasModerationHold) throw fail('NO_MODERATION_HOLD');
  }

  private async load(db: Db, id: string, lock: boolean): Promise<ReviewRow> {
    const query = db.orm.select(reviewColumns).from(bloodRequest).innerJoin(patient, eq(patient.id, bloodRequest.patientId)).where(and(eq(bloodRequest.id, id), isNull(bloodRequest.deletedAt)));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    return row as ReviewRow;
  }
}

export function toReviewView(r: ReviewRow) {
  return {
    id: r.id,
    referenceNo: r.referenceNo,
    patientName: r.patientName,
    requestedBloodGroup: r.requestedBloodGroup,
    component: r.component,
    quantityUnits: r.quantityUnits,
    requiredBy: r.requiredBy,
    urgency: r.urgency,
    priority: r.priority,
    status: r.status,
    areaId: r.areaId,
    contactPhone: r.contactPhone ? maskPhone(r.contactPhone) : null,
    hasModerationHold: r.hasModerationHold,
    assignedSupportUserId: r.assignedSupportUserId,
    submittedAt: r.submittedAt,
    firstActionAt: r.firstActionAt,
    version: r.version,
  };
}
