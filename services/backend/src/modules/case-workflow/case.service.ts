import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, lte, ne, notExists, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { facilityNames } from '../appointments/read-model.public';
import { donorLabels } from '../identity/read-model.public';
import { closeRequest, requestState, returnToSearching } from '../request/request.public';
import { requestRouting } from '../request/read-model.public';
import { CASE_COLUMNS, CaseRow, CaseSupport, fail } from './case.support';
import { ContactAttemptDto, NoteDto } from './case.dto';
import { CaseDetailDto } from './case-detail.dto';
import { LIVE_CASE_STATUSES } from './case-status';
import { appointment, caseDonor, caseNote, caseTask, contactAttempt, coordinationCase, outcomeUpdate, postDonationCheckin } from './schema';

const DUE_MINUTES: Record<string, number> = { Critical: 120, High: 360, Normal: 1440 };
const FOLLOW_UP_EXTRA_MINUTES = 4320;
const CONFIRM_TIMEOUT_MINUTES: Record<string, number> = { Critical: 15, High: 60, Normal: 60 };

type CaseStatusValue = (typeof coordinationCase.$inferSelect)['status'];
type NoteType = (typeof caseNote.$inferSelect)['noteType'];
type ContactValues = Pick<typeof contactAttempt.$inferInsert, 'targetParty' | 'channel' | 'result'>;

export type LeaveKind = 'WITHDRAWN' | 'NO_SHOW' | 'NOT_COMPLETED';

@Injectable()
export class CaseService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly support: CaseSupport,
    private readonly history: StatusHistoryService,
  ) {}

  async linkAvailableDonor(tx: Db, input: { requestId: string; invitationId: string; donorProfileId: string }): Promise<void> {
    const r = await requestState(tx, input.requestId);
    if (!r) return;
    let [caseRow] = (await tx.orm.select(CASE_COLUMNS).from(coordinationCase).where(eq(coordinationCase.requestId, input.requestId)).for('update')) as CaseRow[];

    if (!caseRow) {
      const priority = r.urgency === 'Critical' ? 'Critical' : r.urgency === 'Urgent' ? 'High' : 'Normal';
      [caseRow] = (await tx.orm
        .insert(coordinationCase)
        .values({
          caseNo: sql`'CASE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('crd.coordination_case_no_seq')::text, 6, '0')`,
          requestId: input.requestId, status: 'Open', ownerUserId: r.assignedSupportUserId, priority, areaId: r.areaId, openedAt: sql`now()`,
        })
        .returning(CASE_COLUMNS)) as CaseRow[];
      await this.history.record(tx, {
        entityType: 'COORDINATION_CASE', entityId: caseRow.id, from: null, to: 'Open', actorUserId: null, actorRole: 'SYSTEM',
        source: 'SYSTEM', contextRequestId: input.requestId, correlationId: randomUUID(),
      });
      const due = DUE_MINUTES[priority];
      await this.support.openTask(tx, caseRow, 'TK_CONFIRM_DONOR_ATTENDANCE', `attendance:${caseRow.id}`, due);
      await this.support.openTask(tx, caseRow, 'TK_CONFIRM_REPRESENTATIVE_NEXT_STEP', `representative:${caseRow.id}`, due);
      await this.support.openTask(tx, caseRow, 'TK_OBTAIN_SOURCED_OUTCOME', `outcome:${caseRow.id}`, due * 2);
      await this.support.openTask(tx, caseRow, 'TK_CLOSE_AND_FOLLOW_UP', `close:${caseRow.id}`, due * 2 + FOLLOW_UP_EXTRA_MINUTES);
      await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'CaseCreated', { requestId: input.requestId, caseNo: caseRow.caseNo });
    } else if (caseRow.status === 'Needs replacement') {
      caseRow = await this.support.moveCase(tx, caseRow, 'Open', { userId: null, role: 'SYSTEM' }, 'Replacement donor available');
    } else if (!LIVE_CASE_STATUSES.includes(caseRow.status)) {
      return;
    }

    const [linked] = await tx.orm
      .insert(caseDonor)
      .values({ caseId: caseRow.id, donorProfileId: input.donorProfileId, invitationId: input.invitationId, status: 'Active', joinedAt: sql`now()` })
      .onConflictDoNothing()
      .returning({ id: caseDonor.id });
    if (linked) {
      await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'DonorLinked', { caseDonorId: linked.id }, Date.now());
    }
  }

  async handleDonorLeft(tx: Db, input: { caseDonorId?: string; invitationId?: string; kind: LeaveKind; actorUserId: string | null; actorRole: 'DON' | 'SUP' }): Promise<void> {
    const [donor] = await tx.orm
      .select({ id: caseDonor.id, caseId: caseDonor.caseId, status: caseDonor.status })
      .from(caseDonor)
      .where(input.caseDonorId ? eq(caseDonor.id, input.caseDonorId) : eq(caseDonor.invitationId, input.invitationId as string))
      .for('update');
    if (!donor || donor.status !== 'Active') return;
    const caseRow = await this.support.loadCase(tx, donor.caseId, true);
    const actor = { userId: input.actorUserId, role: input.actorRole };

    const newStatus = input.kind === 'WITHDRAWN' ? 'Withdrawn' : input.kind === 'NO_SHOW' ? 'No-show' : 'Released';
    await tx.orm
      .update(caseDonor)
      .set({
        status: newStatus,
        ...(newStatus === 'Withdrawn' ? { withdrawnAt: sql`now()` } : newStatus === 'Released' ? { releasedAt: sql`now()` } : {}),
        version: sql`${caseDonor.version} + 1`, updatedAt: sql`now()`,
      })
      .where(eq(caseDonor.id, donor.id));
    const live = await tx.orm
      .select({ id: appointment.id, status: appointment.status })
      .from(appointment)
      .where(and(eq(appointment.caseDonorId, donor.id), inArray(appointment.status, ['Proposed', 'Confirmed', 'Checked-in'])));
    for (const a of live) {
      if (a.status === 'Checked-in') continue;
      await this.support.moveAppointment(tx, a.id, caseRow.requestId, a.status as 'Proposed' | 'Confirmed', 'Cancelled', actor, { cancelledAt: sql`now()`, remindersStopped: true });
    }

    const [others] = await tx.orm.select({ n: count() }).from(caseDonor).where(and(eq(caseDonor.caseId, caseRow.id), eq(caseDonor.status, 'Active')));
    if (others.n === 0) {
      if (LIVE_CASE_STATUSES.includes(caseRow.status) && caseRow.status !== 'Needs replacement' && caseRow.status !== 'Outcome pending') {
        await this.support.moveCase(tx, caseRow, 'Needs replacement', actor, input.kind);
      }
      const request = await requestState(tx, caseRow.requestId, true);
      if (request?.status === 'Donor coordination') await returnToSearching(tx, this.history, caseRow.requestId, 'Donor coordination', actor, input.kind);
    }
    await this.support.openTask(tx, caseRow, 'TK_HANDLE_WITHDRAWAL_NOSHOW', `leave:${donor.id}`, DUE_MINUTES[caseRow.priority] ?? 1440, donor.id);
    await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'DonorLeftCase', { caseDonorId: donor.id, kind: input.kind }, Date.now());
  }

  async list(principal: Principal) {
    const rows = await this.db.orm
      .select({
        id: coordinationCase.id, caseNo: coordinationCase.caseNo, status: coordinationCase.status, priority: coordinationCase.priority,
        requestId: coordinationCase.requestId, openedAt: coordinationCase.openedAt, overdue: coordinationCase.isOverdue,
      })
      .from(coordinationCase)
      .where(and(eq(coordinationCase.ownerUserId, principal.userId), ne(coordinationCase.status, 'Closed')))
      .orderBy(desc(sql`${coordinationCase.priority} = 'Critical'`), desc(sql`${coordinationCase.priority} = 'High'`), asc(coordinationCase.openedAt))
      .limit(100);
    const routing = await requestRouting(this.db, rows.map((c) => c.requestId));
    return rows.map((c) => ({ ...c, requestReference: routing.get(c.requestId)?.referenceNo ?? null }));
  }

  async detail(principal: Principal, caseId: string): Promise<CaseDetailDto> {
    const row = await this.support.loadCase(this.db, caseId, false);
    await this.support.requireAccess(this.db, principal, row, 'case.view');
    const orm = this.db.orm;
    const [donorRows, appointmentRows, tasks, notes, contacts, outcomes] = await Promise.all([
      orm.select({ id: caseDonor.id, donorProfileId: caseDonor.donorProfileId, status: caseDonor.status, joinedAt: caseDonor.joinedAt })
        .from(caseDonor).where(eq(caseDonor.caseId, caseId)).orderBy(asc(caseDonor.createdAt)),
      orm.select({
        id: appointment.id, caseDonorId: appointment.caseDonorId, facilityId: appointment.facilityId, scheduledStart: appointment.scheduledStart,
        status: appointment.status, previousAppointmentId: appointment.previousAppointmentId,
      }).from(appointment).where(eq(appointment.caseId, caseId)).orderBy(asc(appointment.createdAt)),
      orm.select({ id: caseTask.id, taskType: caseTask.taskType, status: caseTask.status, dueAt: caseTask.dueAt, assigneeUserId: caseTask.assigneeUserId })
        .from(caseTask).where(eq(caseTask.caseId, caseId)).orderBy(asc(caseTask.createdAt)),
      orm.select({ id: caseNote.id, noteType: caseNote.noteType, body: caseNote.body, authorUserId: caseNote.authorUserId, createdAt: caseNote.createdAt })
        .from(caseNote).where(eq(caseNote.caseId, caseId)).orderBy(asc(caseNote.createdAt)),
      orm.select({
        id: contactAttempt.id, targetParty: contactAttempt.targetParty, channel: contactAttempt.channel, result: contactAttempt.result,
        attemptedBy: contactAttempt.attemptedBy, attemptedAt: contactAttempt.attemptedAt,
      }).from(contactAttempt).where(eq(contactAttempt.caseId, caseId)).orderBy(asc(contactAttempt.attemptedAt)),
      orm.select({
        id: outcomeUpdate.id, outcomeType: outcomeUpdate.outcomeType, sourceType: outcomeUpdate.sourceType, confidence: outcomeUpdate.confidence,
        units: outcomeUpdate.unitsCount, reportedByName: outcomeUpdate.reportedByName, reportedByRole: outcomeUpdate.reportedByRole,
        channel: outcomeUpdate.channel, reportedAt: outcomeUpdate.reportedAt, disputed: outcomeUpdate.isDisputed, supersedesId: outcomeUpdate.supersedesId,
      }).from(outcomeUpdate).where(eq(outcomeUpdate.caseId, caseId)).orderBy(asc(outcomeUpdate.reportedAt)),
    ]);
    const [labels, facilities, routing] = await Promise.all([
      donorLabels(this.db, donorRows.map((d) => d.donorProfileId)),
      facilityNames(this.db, appointmentRows.map((a) => a.facilityId)),
      requestRouting(this.db, [row.requestId]),
    ]);
    const donors = donorRows.map((d) => ({ id: d.id, donorCode: labels.get(d.donorProfileId)?.donorCode ?? null, status: d.status, joinedAt: d.joinedAt }));
    const appointments = appointmentRows.map((a) => ({ ...a, facility: facilities.get(a.facilityId)?.nameEn ?? null }));
    return {
      id: row.id, caseNo: row.caseNo, requestId: row.requestId, requestReference: routing.get(row.requestId)?.referenceNo ?? null, status: row.status,
      priority: row.priority, ownerUserId: row.ownerUserId, disputed: row.disputed, donors, appointments, tasks, notes, contacts, outcomes,
    };
  }

  async startScheduling(principal: Principal, caseId: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      if (row.status === 'Scheduling') return { id: row.id, status: row.status };
      if (row.status !== 'Open') throw fail('INVALID_TRANSITION');
      await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' });
      return { id: row.id, status: 'Scheduling' };
    });
  }

  async addNote(principal: Principal, caseId: string, dto: NoteDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, false);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      return this.insertNote(tx, caseId, principal.userId, (dto.noteType ?? 'GENERAL') as NoteType, dto.body);
    });
  }

  async logContact(principal: Principal, caseId: string, dto: ContactAttemptDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, false);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      if (dto.caseDonorId) {
        const [own] = await tx.orm.select({ id: caseDonor.id }).from(caseDonor).where(and(eq(caseDonor.id, dto.caseDonorId), eq(caseDonor.caseId, caseId)));
        if (!own) throw new NotFoundException({ code: 'CASE_DONOR_NOT_FOUND' });
      }
      const [attempt] = await tx.orm
        .insert(contactAttempt)
        .values({
          caseId, caseDonorId: dto.caseDonorId ?? null, facilityId: dto.facilityId ?? null, targetParty: dto.party as ContactValues['targetParty'],
          channel: dto.channel as ContactValues['channel'], result: dto.result as ContactValues['result'], attemptedBy: principal.userId, attemptedAt: sql`now()`,
        })
        .returning({ id: contactAttempt.id });
      if (dto.externalPerson) await this.insertNote(tx, caseId, principal.userId, 'EXTERNAL_CONTACT', dto.externalPerson);
      return { id: attempt.id };
    });
  }

  async close(principal: Principal, caseId: string, note: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      if (row.status !== 'Resolved') throw fail('CASE_NOT_RESOLVED');
      if (row.disputed) throw fail('CASE_DISPUTED');
      const status = (await requestState(tx, row.requestId, true))!.status;
      await this.support.finishTask(tx, caseId, 'TK_CLOSE_AND_FOLLOW_UP', principal.userId);
      await this.insertNote(tx, caseId, principal.userId, 'GENERAL', note);
      await this.support.moveCase(tx, row, 'Closed', { userId: principal.userId, role: 'SUP' });
      if (status === 'Fulfilled' || status === 'Partially fulfilled') await closeRequest(tx, this.history, row.requestId, status, principal.userId);
      const completed = await tx.orm
        .select({ donorProfileId: caseDonor.donorProfileId })
        .from(caseDonor)
        .where(and(eq(caseDonor.caseId, caseId), eq(caseDonor.status, 'Completed')));
      if (completed.length > 0) {
        await tx.orm.insert(postDonationCheckin).values(completed.map((d) => ({ donorProfileId: d.donorProfileId, scheduledFor: sql`now() + interval '24 hours'` })));
      }
      await this.support.event(tx, 'COORDINATION_CASE', caseId, 'CaseClosed', { requestId: row.requestId });
      return { id: caseId, status: 'Closed' };
    });
  }

  async advanceAttendance(): Promise<number> {
    const rows = await this.db.orm
      .selectDistinct({ id: coordinationCase.id })
      .from(coordinationCase)
      .innerJoin(appointment, eq(appointment.caseId, coordinationCase.id))
      .where(and(eq(coordinationCase.status, 'Scheduled'), eq(appointment.status, 'Confirmed'), lte(appointment.scheduledStart, sql`now()`)))
      .limit(100);
    for (const r of rows) {
      await this.db.transaction(async (tx) => {
        const row = await this.support.loadCase(tx, r.id, true);
        if (row.status === 'Scheduled') await this.support.moveCase(tx, row, 'Attendance pending', { userId: null, role: 'SYSTEM' }, 'Appointment time reached');
      });
    }
    return rows.length;
  }

  async flagUnconfirmedDonors(): Promise<number> {
    const confirmed = (db: Db, caseDonorId: typeof caseDonor.id | string) =>
      db.orm.select({ id: appointment.id }).from(appointment).where(and(eq(appointment.caseDonorId, caseDonorId), isNotNull(appointment.confirmedByDonorAt)));
    const rows = await this.db.orm
      .select({ id: caseDonor.id, caseId: caseDonor.caseId, donorProfileId: caseDonor.donorProfileId })
      .from(caseDonor)
      .innerJoin(coordinationCase, eq(coordinationCase.id, caseDonor.caseId))
      .where(and(
        eq(caseDonor.status, 'Active'), inArray(coordinationCase.status, LIVE_CASE_STATUSES as CaseStatusValue[]),
        lte(caseDonor.joinedAt, sql`now() - make_interval(mins => CASE WHEN ${coordinationCase.priority} = 'Critical' THEN ${CONFIRM_TIMEOUT_MINUTES.Critical}::int ELSE ${CONFIRM_TIMEOUT_MINUTES.High}::int END)`),
        notExists(confirmed(this.db, caseDonor.id)),
        notExists(this.db.orm.select({ id: caseTask.id }).from(caseTask).where(eq(caseTask.dedupeKey, sql`'donor-confirm-timeout:' || ${caseDonor.id}`))),
      ))
      .orderBy(asc(caseDonor.joinedAt))
      .limit(50);
    for (const r of rows) {
      await this.db.transaction(async (tx) => {
        if ((await confirmed(tx, r.id).limit(1)).length > 0) return;
        const caseRow = await this.support.loadCase(tx, r.caseId, true);
        await this.support.openTask(tx, caseRow, 'TK_CALLBACK', `donor-confirm-timeout:${r.id}`, 0, r.id);
        await this.support.event(tx, 'CASE_DONOR', r.id, 'DonorConfirmationTimedOut', {
          caseId: r.caseId,
          caseDonorId: r.id,
          requestId: caseRow.requestId,
          donorProfileId: r.donorProfileId,
        });
      });
    }
    return rows.length;
  }

  async reconcileClosedRequests(): Promise<number> {
    // Raw SQL: selects cases by request status in another module (ADR-16 rule 6).
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT c.id FROM crd.coordination_case c JOIN req.blood_request r ON r.id = c.request_id
        WHERE c.status IN ('Open','Scheduling','Scheduled','Attendance pending','Needs replacement') AND r.status IN ('Cancelled','Unable to fulfil','Rejected') LIMIT 50`,
    );
    for (const r of rows) await this.db.transaction((tx) => this.reconcileOne(tx, r.id));
    return rows.length;
  }

  async reconcileOne(tx: Db, caseId: string): Promise<void> {
    const row = await this.support.loadCase(tx, caseId, true);
    if (row.status === 'Resolved' || row.status === 'Closed') return;
    const live = await tx.orm
      .select({ id: appointment.id, status: appointment.status })
      .from(appointment)
      .where(and(eq(appointment.caseId, row.id), inArray(appointment.status, ['Proposed', 'Confirmed'])));
    for (const a of live) {
      await this.support.moveAppointment(tx, a.id, row.requestId, a.status as 'Proposed' | 'Confirmed', 'Cancelled', { userId: null, role: 'SYSTEM' }, { cancelledAt: sql`now()`, remindersStopped: true });
    }
    await tx.orm
      .update(caseTask)
      .set({ status: 'Cancelled', version: sql`${caseTask.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(caseTask.caseId, row.id), inArray(caseTask.status, ['Open', 'In progress']), ne(caseTask.taskType, 'TK_CLOSE_AND_FOLLOW_UP')));
    await this.support.moveCase(tx, row, 'Resolved', { userId: null, role: 'SYSTEM' }, 'Request ended');
  }

  async insertNote(tx: Db, caseId: string, authorUserId: string, noteType: NoteType, body: string) {
    const [note] = await tx.orm.insert(caseNote).values({ caseId, authorUserId, noteType, body }).returning({ id: caseNote.id });
    return { id: note.id };
  }
}
