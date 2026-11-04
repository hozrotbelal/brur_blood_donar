import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { appointmentStateMachine, caseStateMachine, CaseStatus, AppointmentStatus } from './case-status';
import { appointment, caseTask, coordinationCase } from './schema';

export interface CaseRow {
  id: string;
  caseNo: string;
  requestId: string;
  status: CaseStatus;
  ownerUserId: string | null;
  priority: string;
  areaId: string | null;
  disputed: boolean;
  version: number;
}

export type TaskType = (typeof caseTask.$inferSelect)['taskType'];
export type AppointmentChanges = Omit<PgUpdateSetSource<typeof appointment>, 'status' | 'version' | 'updatedAt'>;

export const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

export const CASE_COLUMNS = {
  id: coordinationCase.id, caseNo: coordinationCase.caseNo, requestId: coordinationCase.requestId, status: coordinationCase.status,
  ownerUserId: coordinationCase.ownerUserId, priority: coordinationCase.priority, areaId: coordinationCase.areaId,
  disputed: coordinationCase.disputed, version: coordinationCase.version,
};

@Injectable()
export class CaseSupport {
  constructor(
    private readonly policy: PolicyService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
  ) {}

  async loadCase(db: Db, caseId: string, lock: boolean): Promise<CaseRow> {
    const query = db.orm.select(CASE_COLUMNS).from(coordinationCase).where(eq(coordinationCase.id, caseId));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException({ code: 'CASE_NOT_FOUND' });
    return row as CaseRow;
  }

  async requireAccess(db: Db, principal: Principal, row: CaseRow, key: string): Promise<void> {
    const decision = this.policy.decide(principal, key, {
      resource: { assignedUserIds: row.ownerUserId ? [row.ownerUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
      principalAreaIds: await staffAreaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new NotFoundException({ code: 'CASE_NOT_FOUND' });
  }

  async moveCase(tx: Db, row: CaseRow, to: CaseStatus, actor: { userId: string | null; role: 'DON' | 'SUP' | 'SYSTEM' }, reason?: string): Promise<CaseRow> {
    if (row.status === to) return row;
    await tx.orm
      .update(coordinationCase)
      .set({
        status: to,
        ...(to === 'Resolved' ? { resolvedAt: sql`now()` } : to === 'Closed' ? { closedAt: sql`now()` } : {}),
        version: sql`${coordinationCase.version} + 1`, updatedAt: sql`now()`,
      })
      .where(eq(coordinationCase.id, row.id));
    await this.history.record(
      tx,
      {
        entityType: 'COORDINATION_CASE', entityId: row.id, from: row.status, to, actorUserId: actor.userId, actorRole: actor.role,
        source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: row.requestId, reason, correlationId: randomUUID(),
      },
      caseStateMachine,
    );
    return { ...row, status: to };
  }

  async moveAppointment(
    tx: Db, id: string, requestId: string, from: AppointmentStatus, to: AppointmentStatus,
    actor: { userId: string | null; role: 'DON' | 'SUP' | 'SYSTEM' }, changes: AppointmentChanges = {},
  ) {
    appointmentStateMachine.assert(from, to);
    await tx.orm
      .update(appointment)
      .set({ status: to, ...changes, version: sql`${appointment.version} + 1`, updatedAt: sql`now()` })
      .where(eq(appointment.id, id));
    await this.history.record(tx, {
      entityType: 'APPOINTMENT', entityId: id, from, to, actorUserId: actor.userId, actorRole: actor.role,
      source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: requestId, correlationId: randomUUID(),
    });
  }

  async openTask(tx: Db, caseRow: Pick<CaseRow, 'id' | 'requestId' | 'ownerUserId'>, type: TaskType, dedupeKey: string, dueMinutes: number, caseDonorId?: string) {
    await tx.orm
      .insert(caseTask)
      .values({
        caseId: caseRow.id, requestId: caseRow.requestId, caseDonorId: caseDonorId ?? null, taskType: type, status: 'Open',
        assigneeUserId: caseRow.ownerUserId, dueAt: sql`now() + make_interval(mins => ${dueMinutes}::int)`, dedupeKey,
      })
      .onConflictDoNothing();
  }

  async finishTask(tx: Db, caseId: string, type: TaskType, userId: string | null, status: 'Done' | 'Cancelled' = 'Done') {
    await tx.orm
      .update(caseTask)
      .set({ status, completedBy: userId, completedAt: sql`now()`, version: sql`${caseTask.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(caseTask.caseId, caseId), eq(caseTask.taskType, type), inArray(caseTask.status, ['Open', 'In progress'])));
  }

  event(tx: Db, aggregateType: string, aggregateId: string, eventType: string, payload: Record<string, unknown>, version?: number) {
    return this.outbox.append(tx, { aggregateType, aggregateId, eventType, payload, version });
  }
}
