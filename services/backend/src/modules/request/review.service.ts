import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { PermissionScope, Principal, SCOPE_ORDER } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { maskPhone } from '../identity/identity.public';
import { RequestCommand, RequestStatus, canActorRun, findTransition, requestStateMachine } from './request-status';
import { RejectRequestDto, ResolveFlagDto, RequestInformationDto, VerifyRequestDto } from './review.dto';

interface ReviewRow {
  id: string;
  reference_no: string | null;
  patient_id: string;
  patient_name: string;
  requested_blood_group: string;
  component: string;
  quantity_units: number;
  required_by: Date;
  urgency: string;
  priority: string;
  status: RequestStatus;
  area_id: string | null;
  contact_phone: string | null;
  has_moderation_hold: boolean;
  assigned_support_user_id: string | null;
  submitted_at: Date | null;
  first_action_at: Date | null;
  version: number;
}

const COLUMNS = `r.id, r.reference_no, r.patient_id, p.display_name AS patient_name, r.requested_blood_group, r.component, r.quantity_units,
  r.required_by, r.urgency, r.priority, r.status, r.area_id, r.contact_phone, r.has_moderation_hold, r.assigned_support_user_id,
  r.submitted_at, r.first_action_at, r.version`;
const FROM = 'req.blood_request r JOIN req.patient p ON p.id = r.patient_id';
const REVIEW_STATUSES = ['Submitted', 'Under review', 'Needs information'];

export interface RequestFlagView {
  id: string;
  flagType: string;
  matchedRequestId: string | null;
  matchedReferenceNo: string | null;
  detail: Record<string, unknown>;
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
    const areas = await this.areaIds(this.db, principal.userId);
    const scope = widestScope(principal, 'blood_request.view');
    const visible = scope === 'All' ? 'true' : scope === 'Area' ? '(r.assigned_support_user_id = $1 OR r.area_id = ANY($2::uuid[]))' : '(r.assigned_support_user_id = $1)';
    const { rows } = await this.db.query<ReviewRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
        WHERE r.status = ANY($3::request_status[]) AND r.deleted_at IS NULL AND ${scope ? visible : 'false'}
        ORDER BY (r.urgency = 'Critical') DESC, (r.urgency = 'Urgent') DESC, r.required_by LIMIT 100`,
      [principal.userId, areas, status ? [status] : REVIEW_STATUSES],
    );
    return rows.map(toReviewView);
  }

  async detail(principal: Principal, id: string) {
    const row = await this.load(this.db, id, false);
    await this.requireView(this.db, principal, row);
    return { ...toReviewView(row), flags: await this.flags(id) };
  }

  async flags(requestId: string) {
    const { rows } = await this.db.query<RequestFlagView>(
      `SELECT f.id, f.flag_type AS "flagType", f.matched_request_id AS "matchedRequestId", m.reference_no AS "matchedReferenceNo", f.detail,
              f.status, f.created_at AS "createdAt", f.resolved_at AS "resolvedAt", f.resolution_note AS "resolutionNote"
         FROM req.request_flag f LEFT JOIN req.blood_request m ON m.id = f.matched_request_id WHERE f.request_id = $1 ORDER BY f.created_at`,
      [requestId],
    );
    return rows;
  }

  async resolveFlag(principal: Principal, requestId: string, flagId: string, dto: ResolveFlagDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.load(tx, requestId, true);
      await this.requireApprove(tx, principal, row);
      const res = await tx.query(
        `UPDATE req.request_flag SET status = $3, resolved_by = $4, resolved_at = now(), resolution_note = $5
          WHERE id = $1 AND request_id = $2 AND status = 'Open'`,
        [flagId, requestId, dto.resolution, principal.userId, dto.note],
      );
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
      if (row.assigned_support_user_id === principal.userId && row.status === 'Under review') return toReviewView(row);
      if (row.assigned_support_user_id && row.assigned_support_user_id !== principal.userId) throw fail('ALREADY_PICKED_UP', HttpStatus.CONFLICT);
      this.transition(row, 'pick_up', principal);
      await tx.query(
        `UPDATE req.blood_request SET status = 'Under review', assigned_support_user_id = $2, first_action_at = COALESCE(first_action_at, now()),
                version = version + 1, updated_at = now() WHERE id = $1`,
        [id, principal.userId],
      );
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
      await tx.query(
        `UPDATE req.blood_request SET status = 'Needs information', version = version + 1, updated_at = now() WHERE id = $1`,
        [id],
      );
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
      if (row.has_moderation_hold) throw fail('MODERATION_REVIEW_IN_PROGRESS');
      const open = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM req.request_flag WHERE request_id = $1 AND status = 'Open'`, [id]);
      if (open.rows[0].n > 0) throw fail('UNRESOLVED_FLAGS');
      const gaps = checklistGaps(dto);
      if (gaps.length > 0) throw new HttpException({ code: 'CHECKLIST_INCOMPLETE', missing: gaps }, HttpStatus.UNPROCESSABLE_ENTITY);
      await tx.query(
        `UPDATE req.blood_request SET status = 'Verified', verified_at = now(), version = version + 1, updated_at = now() WHERE id = $1`,
        [id],
      );
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
      await tx.query(`UPDATE req.blood_request SET status = 'Rejected', version = version + 1, updated_at = now() WHERE id = $1`, [id]);
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
      resource: { assignedUserIds: row.assigned_support_user_id ? [row.assigned_support_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
      principalAreaIds: await this.areaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
  }

  private async requireApprove(db: Db, principal: Principal, row: ReviewRow) {
    await this.requireView(db, principal, row);
    const decision = this.policy.decide(principal, 'blood_request.approve', {
      resource: { assignedUserIds: row.assigned_support_user_id ? [row.assigned_support_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
      principalAreaIds: await this.areaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
  }

  private async requireModerationReject(principal: Principal, row: ReviewRow) {
    if (!widestScope(principal, 'blood_request.reject_moderation')) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    if (!row.has_moderation_hold) throw fail('NO_MODERATION_HOLD');
  }

  private async load(db: Db, id: string, lock: boolean): Promise<ReviewRow> {
    const { rows } = await db.query<ReviewRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1 AND r.deleted_at IS NULL ${lock ? 'FOR UPDATE OF r' : ''}`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    return rows[0];
  }

  private async areaIds(db: Db, userId: string): Promise<string[]> {
    const { rows } = await db.query<{ area_id: string }>(
      `SELECT s.area_id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id
        WHERE ur.user_id = $1 AND ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id IS NOT NULL`,
      [userId],
    );
    return rows.map((r) => r.area_id);
  }
}

export function toReviewView(r: ReviewRow) {
  return {
    id: r.id,
    referenceNo: r.reference_no,
    patientName: r.patient_name,
    requestedBloodGroup: r.requested_blood_group,
    component: r.component,
    quantityUnits: r.quantity_units,
    requiredBy: r.required_by,
    urgency: r.urgency,
    priority: r.priority,
    status: r.status,
    areaId: r.area_id,
    contactPhone: r.contact_phone ? maskPhone(r.contact_phone) : null,
    hasModerationHold: r.has_moderation_hold,
    assignedSupportUserId: r.assigned_support_user_id,
    submittedAt: r.submitted_at,
    firstActionAt: r.first_action_at,
    version: r.version,
  };
}
