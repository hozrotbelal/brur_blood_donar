import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { appointmentStateMachine, caseStateMachine, CaseStatus, AppointmentStatus } from './case-status';

export interface CaseRow {
  id: string;
  case_no: string;
  request_id: string;
  status: CaseStatus;
  owner_user_id: string | null;
  priority: string;
  area_id: string | null;
  disputed: boolean;
  version: number;
}

export const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

const CASE_COLUMNS = 'c.id, c.case_no, c.request_id, c.status, c.owner_user_id, c.priority, c.area_id, c.disputed, c.version';

@Injectable()
export class CaseSupport {
  constructor(
    private readonly policy: PolicyService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
  ) {}

  async loadCase(db: Db, caseId: string, lock: boolean): Promise<CaseRow> {
    const { rows } = await db.query<CaseRow>(
      `SELECT ${CASE_COLUMNS} FROM crd.coordination_case c WHERE c.id = $1 ${lock ? 'FOR UPDATE OF c' : ''}`,
      [caseId],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'CASE_NOT_FOUND' });
    return rows[0];
  }

  async requireAccess(db: Db, principal: Principal, row: CaseRow, key: string): Promise<void> {
    const decision = this.policy.decide(principal, key, {
      resource: { assignedUserIds: row.owner_user_id ? [row.owner_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
      principalAreaIds: await staffAreaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new NotFoundException({ code: 'CASE_NOT_FOUND' });
  }

  async moveCase(tx: Db, row: CaseRow, to: CaseStatus, actor: { userId: string | null; role: 'DON' | 'SUP' | 'SYSTEM' }, reason?: string): Promise<CaseRow> {
    if (row.status === to) return row;
    const extra =
      to === 'Resolved' ? ', resolved_at = now()' : to === 'Closed' ? ', closed_at = now()' : to === 'Open' && row.status === 'Needs replacement' ? '' : '';
    await tx.query(`UPDATE crd.coordination_case SET status = $2${extra}, version = version + 1, updated_at = now() WHERE id = $1`, [row.id, to]);
    await this.history.record(
      tx,
      {
        entityType: 'COORDINATION_CASE', entityId: row.id, from: row.status, to, actorUserId: actor.userId, actorRole: actor.role,
        source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: row.request_id, reason, correlationId: randomUUID(),
      },
      caseStateMachine,
    );
    return { ...row, status: to };
  }

  async moveAppointment(
    tx: Db, id: string, requestId: string, from: AppointmentStatus, to: AppointmentStatus,
    actor: { userId: string | null; role: 'DON' | 'SUP' | 'SYSTEM' }, set = '',
  ) {
    appointmentStateMachine.assert(from, to);
    await tx.query(`UPDATE crd.appointment SET status = $2${set}, version = version + 1, updated_at = now() WHERE id = $1`, [id, to]);
    await this.history.record(tx, {
      entityType: 'APPOINTMENT', entityId: id, from, to, actorUserId: actor.userId, actorRole: actor.role,
      source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: requestId, correlationId: randomUUID(),
    });
  }

  async openTask(tx: Db, caseRow: Pick<CaseRow, 'id' | 'request_id' | 'owner_user_id'>, type: string, dedupeKey: string, dueMinutes: number, caseDonorId?: string) {
    await tx.query(
      `INSERT INTO crd.case_task (case_id, request_id, case_donor_id, task_type, status, assignee_user_id, due_at, dedupe_key)
       VALUES ($1, $2, $3, $4::case_task_type, 'Open', $5, now() + make_interval(mins => $6), $7)
       ON CONFLICT DO NOTHING`,
      [caseRow.id, caseRow.request_id, caseDonorId ?? null, type, caseRow.owner_user_id, dueMinutes, dedupeKey],
    );
  }

  async finishTask(tx: Db, caseId: string, type: string, userId: string | null, status: 'Done' | 'Cancelled' = 'Done') {
    await tx.query(
      `UPDATE crd.case_task SET status = $4::task_status, completed_by = $3, completed_at = now(), version = version + 1, updated_at = now()
        WHERE case_id = $1 AND task_type = $2::case_task_type AND status IN ('Open','In progress')`,
      [caseId, type, userId, status],
    );
  }

  event(tx: Db, aggregateType: string, aggregateId: string, eventType: string, payload: Record<string, unknown>, version?: number) {
    return this.outbox.append(tx, { aggregateType, aggregateId, eventType, payload, version });
  }
}
