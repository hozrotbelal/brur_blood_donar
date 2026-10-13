import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { findTransition, requestStateMachine } from '../request/request.public';
import { CaseRow, CaseSupport, fail } from './case.support';
import { ContactAttemptDto, NoteDto } from './case.dto';
import { LIVE_CASE_STATUSES } from './case-status';

const DUE_MINUTES: Record<string, number> = { Critical: 120, High: 360, Normal: 1440 };
const FOLLOW_UP_EXTRA_MINUTES = 4320;
const CONFIRM_TIMEOUT_MINUTES: Record<string, number> = { Critical: 15, High: 60, Normal: 60 };

export type LeaveKind = 'WITHDRAWN' | 'NO_SHOW' | 'NOT_COMPLETED';

@Injectable()
export class CaseService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly support: CaseSupport,
    private readonly history: StatusHistoryService,
  ) {}

  async linkAvailableDonor(tx: Db, input: { requestId: string; invitationId: string; donorProfileId: string }): Promise<void> {
    const req = await tx.query<{ urgency: string; area_id: string | null; assigned_support_user_id: string | null; status: string }>(
      'SELECT urgency, area_id, assigned_support_user_id, status FROM req.blood_request WHERE id = $1',
      [input.requestId],
    );
    const r = req.rows[0];
    if (!r) return;
    let caseRow = (
      await tx.query<CaseRow>(
        `SELECT c.id, c.case_no, c.request_id, c.status, c.owner_user_id, c.priority, c.area_id, c.disputed, c.version
           FROM crd.coordination_case c WHERE c.request_id = $1 FOR UPDATE`,
        [input.requestId],
      )
    ).rows[0];

    if (!caseRow) {
      const priority = r.urgency === 'Critical' ? 'Critical' : r.urgency === 'Urgent' ? 'High' : 'Normal';
      const created = await tx.query<CaseRow>(
        `INSERT INTO crd.coordination_case (case_no, request_id, status, owner_user_id, priority, area_id, opened_at)
         VALUES ('CASE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('crd.coordination_case_no_seq')::text, 6, '0'),
                 $1, 'Open', $2, $3::priority, $4, now())
         RETURNING id, case_no, request_id, status, owner_user_id, priority, area_id, disputed, version`,
        [input.requestId, r.assigned_support_user_id, priority, r.area_id],
      );
      caseRow = created.rows[0];
      await this.history.record(tx, {
        entityType: 'COORDINATION_CASE', entityId: caseRow.id, from: null, to: 'Open', actorUserId: null, actorRole: 'SYSTEM',
        source: 'SYSTEM', contextRequestId: input.requestId, correlationId: randomUUID(),
      });
      const due = DUE_MINUTES[priority];
      await this.support.openTask(tx, caseRow, 'TK_CONFIRM_DONOR_ATTENDANCE', `attendance:${caseRow.id}`, due);
      await this.support.openTask(tx, caseRow, 'TK_CONFIRM_REPRESENTATIVE_NEXT_STEP', `representative:${caseRow.id}`, due);
      await this.support.openTask(tx, caseRow, 'TK_OBTAIN_SOURCED_OUTCOME', `outcome:${caseRow.id}`, due * 2);
      await this.support.openTask(tx, caseRow, 'TK_CLOSE_AND_FOLLOW_UP', `close:${caseRow.id}`, due * 2 + FOLLOW_UP_EXTRA_MINUTES);
      await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'CaseCreated', { requestId: input.requestId, caseNo: caseRow.case_no });
    } else if (caseRow.status === 'Needs replacement') {
      caseRow = await this.support.moveCase(tx, caseRow, 'Open', { userId: null, role: 'SYSTEM' }, 'Replacement donor available');
    } else if (!LIVE_CASE_STATUSES.includes(caseRow.status)) {
      return;
    }

    const linked = await tx.query<{ id: string }>(
      `INSERT INTO crd.case_donor (case_id, donor_profile_id, invitation_id, status, joined_at)
       VALUES ($1, $2, $3, 'Active', now()) ON CONFLICT DO NOTHING RETURNING id`,
      [caseRow.id, input.donorProfileId, input.invitationId],
    );
    if (linked.rows[0]) {
      await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'DonorLinked', { caseDonorId: linked.rows[0].id }, Date.now());
    }
  }

  async handleDonorLeft(tx: Db, input: { caseDonorId?: string; invitationId?: string; kind: LeaveKind; actorUserId: string | null; actorRole: 'DON' | 'SUP' }): Promise<void> {
    const found = await tx.query<{ id: string; case_id: string; status: string }>(
      `SELECT id, case_id, status FROM crd.case_donor WHERE ${input.caseDonorId ? 'id' : 'invitation_id'} = $1 FOR UPDATE`,
      [input.caseDonorId ?? input.invitationId],
    );
    const donor = found.rows[0];
    if (!donor || donor.status !== 'Active') return;
    const caseRow = await this.support.loadCase(tx, donor.case_id, true);

    const newStatus = input.kind === 'WITHDRAWN' ? 'Withdrawn' : input.kind === 'NO_SHOW' ? 'No-show' : 'Released';
    await tx.query(
      `UPDATE crd.case_donor SET status = $2::case_donor_status, withdrawn_at = CASE WHEN $2 = 'Withdrawn' THEN now() ELSE withdrawn_at END,
              released_at = CASE WHEN $2 = 'Released' THEN now() ELSE released_at END, version = version + 1, updated_at = now() WHERE id = $1`,
      [donor.id, newStatus],
    );
    const live = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM crd.appointment WHERE case_donor_id = $1 AND status IN ('Proposed','Confirmed','Checked-in')`,
      [donor.id],
    );
    for (const a of live.rows) {
      if (a.status === 'Checked-in') continue;
      await this.support.moveAppointment(tx, a.id, caseRow.request_id, a.status as 'Proposed' | 'Confirmed', 'Cancelled', { userId: input.actorUserId, role: input.actorRole }, ', cancelled_at = now(), reminders_stopped = true');
    }

    const others = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM crd.case_donor WHERE case_id = $1 AND status = 'Active'`, [caseRow.id]);
    if (others.rows[0].n === 0) {
      if (LIVE_CASE_STATUSES.includes(caseRow.status) && caseRow.status !== 'Needs replacement' && caseRow.status !== 'Outcome pending') {
        await this.support.moveCase(tx, caseRow, 'Needs replacement', { userId: input.actorUserId, role: input.actorRole }, input.kind);
      }
      const request = await tx.query<{ status: string }>('SELECT status FROM req.blood_request WHERE id = $1 FOR UPDATE', [caseRow.request_id]);
      if (request.rows[0]?.status === 'Donor coordination' && findTransition('Donor coordination', 'withdrawal_or_no_show')) {
        await tx.query(`UPDATE req.blood_request SET status = 'Searching', version = version + 1, updated_at = now() WHERE id = $1`, [caseRow.request_id]);
        await this.history.record(
          tx,
          {
            entityType: 'BLOOD_REQUEST', entityId: caseRow.request_id, from: 'Donor coordination', to: 'Searching', actorUserId: input.actorUserId,
            actorRole: input.actorRole, source: input.actorUserId ? 'USER' : 'SYSTEM',
            contextRequestId: caseRow.request_id, reasonCode: input.kind, correlationId: randomUUID(),
          },
          requestStateMachine,
        );
      }
    }
    await this.support.openTask(tx, caseRow, 'TK_HANDLE_WITHDRAWAL_NOSHOW', `leave:${donor.id}`, DUE_MINUTES[caseRow.priority] ?? 1440, donor.id);
    await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'DonorLeftCase', { caseDonorId: donor.id, kind: input.kind }, Date.now());
  }

  async list(principal: Principal) {
    const { rows } = await this.db.query<{ id: string; case_no: string; status: string; priority: string; request_id: string; reference_no: string | null; opened_at: Date; is_overdue: boolean }>(
      `SELECT c.id, c.case_no, c.status, c.priority, c.request_id, r.reference_no, c.opened_at, c.is_overdue
         FROM crd.coordination_case c JOIN req.blood_request r ON r.id = c.request_id
        WHERE c.owner_user_id = $1 AND c.status <> 'Closed'
        ORDER BY (c.priority = 'Critical') DESC, (c.priority = 'High') DESC, c.opened_at LIMIT 100`,
      [principal.userId],
    );
    return rows.map((c) => ({ id: c.id, caseNo: c.case_no, status: c.status, priority: c.priority, requestId: c.request_id, requestReference: c.reference_no, openedAt: c.opened_at, overdue: c.is_overdue }));
  }

  async detail(principal: Principal, caseId: string) {
    const row = await this.support.loadCase(this.db, caseId, false);
    await this.support.requireAccess(this.db, principal, row, 'case.view');
    const q = <T extends object>(sql: string) => this.db.query<T>(sql, [caseId]).then((r) => r.rows);
    const [donors, appointments, tasks, notes, contacts, outcomes] = await Promise.all([
      q(`SELECT cd.id, d.donor_code, cd.status, cd.joined_at FROM crd.case_donor cd JOIN idn.donor_profile d ON d.id = cd.donor_profile_id WHERE cd.case_id = $1 ORDER BY cd.created_at`),
      q(`SELECT a.id, a.case_donor_id, a.facility_id, f.name_en AS facility, a.scheduled_start, a.status, a.previous_appointment_id FROM crd.appointment a LEFT JOIN apt.facility f ON f.id = a.facility_id WHERE a.case_id = $1 ORDER BY a.created_at`),
      q(`SELECT id, task_type, status, due_at, assignee_user_id FROM crd.case_task WHERE case_id = $1 ORDER BY created_at`),
      q(`SELECT id, note_type, body, author_user_id, created_at FROM crd.case_note WHERE case_id = $1 ORDER BY created_at`),
      q(`SELECT id, target_party, channel, result, attempted_by, attempted_at FROM crd.contact_attempt WHERE case_id = $1 ORDER BY attempted_at`),
      q(`SELECT id, outcome_type, source_type, confidence, units_count, reported_by_name, reported_by_role, channel, reported_at, is_disputed FROM crd.outcome_update WHERE case_id = $1 ORDER BY reported_at`),
    ]);
    return { id: row.id, caseNo: row.case_no, requestId: row.request_id, status: row.status, priority: row.priority, ownerUserId: row.owner_user_id, disputed: row.disputed, donors, appointments, tasks, notes, contacts, outcomes };
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
      const note = await tx.query<{ id: string }>(
        `INSERT INTO crd.case_note (case_id, author_user_id, note_type, body) VALUES ($1, $2, $3::note_type, $4) RETURNING id`,
        [caseId, principal.userId, dto.noteType ?? 'GENERAL', dto.body],
      );
      return { id: note.rows[0].id };
    });
  }

  async logContact(principal: Principal, caseId: string, dto: ContactAttemptDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, false);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      if (dto.caseDonorId) {
        const own = await tx.query('SELECT 1 FROM crd.case_donor WHERE id = $1 AND case_id = $2', [dto.caseDonorId, caseId]);
        if (!own.rows[0]) throw new NotFoundException({ code: 'CASE_DONOR_NOT_FOUND' });
      }
      const attempt = await tx.query<{ id: string }>(
        `INSERT INTO crd.contact_attempt (case_id, case_donor_id, facility_id, target_party, channel, result, attempted_by, attempted_at)
         VALUES ($1, $2, $3, $4::contact_party, $5::contact_channel, $6::contact_result, $7, now()) RETURNING id`,
        [caseId, dto.caseDonorId ?? null, dto.facilityId ?? null, dto.party, dto.channel, dto.result, principal.userId],
      );
      if (dto.externalPerson) {
        await tx.query(`INSERT INTO crd.case_note (case_id, author_user_id, note_type, body) VALUES ($1, $2, 'EXTERNAL_CONTACT', $3)`, [caseId, principal.userId, dto.externalPerson]);
      }
      return { id: attempt.rows[0].id };
    });
  }

  async close(principal: Principal, caseId: string, note: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      if (row.status !== 'Resolved') throw fail('CASE_NOT_RESOLVED');
      if (row.disputed) throw fail('CASE_DISPUTED');
      const request = await tx.query<{ status: string }>('SELECT status FROM req.blood_request WHERE id = $1 FOR UPDATE', [row.request_id]);
      const status = request.rows[0].status;
      await this.support.finishTask(tx, caseId, 'TK_CLOSE_AND_FOLLOW_UP', principal.userId);
      await tx.query(`INSERT INTO crd.case_note (case_id, author_user_id, note_type, body) VALUES ($1, $2, 'GENERAL', $3)`, [caseId, principal.userId, note]);
      await this.support.moveCase(tx, row, 'Closed', { userId: principal.userId, role: 'SUP' });
      if (status === 'Fulfilled' || status === 'Partially fulfilled') {
        await tx.query(`UPDATE req.blood_request SET status = 'Closed', closed_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [row.request_id]);
        await this.history.record(
          tx,
          {
            entityType: 'BLOOD_REQUEST', entityId: row.request_id, from: status as 'Fulfilled', to: 'Closed', actorUserId: principal.userId, actorRole: 'SUP',
            source: 'USER', contextRequestId: row.request_id, correlationId: randomUUID(),
          },
          requestStateMachine,
        );
      }
      await tx.query(
        `INSERT INTO crd.post_donation_checkin (donor_profile_id, scheduled_for)
         SELECT cd.donor_profile_id, now() + interval '24 hours' FROM crd.case_donor cd WHERE cd.case_id = $1 AND cd.status = 'Completed'`,
        [caseId],
      );
      await this.support.event(tx, 'COORDINATION_CASE', caseId, 'CaseClosed', { requestId: row.request_id });
      return { id: caseId, status: 'Closed' };
    });
  }

  async advanceAttendance(): Promise<number> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT DISTINCT c.id FROM crd.coordination_case c JOIN crd.appointment a ON a.case_id = c.id
        WHERE c.status = 'Scheduled' AND a.status = 'Confirmed' AND a.scheduled_start <= now() LIMIT 100`,
    );
    for (const r of rows) {
      await this.db.transaction(async (tx) => {
        const row = await this.support.loadCase(tx, r.id, true);
        if (row.status === 'Scheduled') await this.support.moveCase(tx, row, 'Attendance pending', { userId: null, role: 'SYSTEM' }, 'Appointment time reached');
      });
    }
    return rows.length;
  }

  async flagUnconfirmedDonors(): Promise<number> {
    const { rows } = await this.db.query<{ id: string; case_id: string; donor_profile_id: string }>(
      `SELECT cd.id, cd.case_id, cd.donor_profile_id
         FROM crd.case_donor cd JOIN crd.coordination_case c ON c.id = cd.case_id
        WHERE cd.status = 'Active' AND c.status::text = ANY($1::text[])
          AND cd.joined_at <= now() - make_interval(mins => CASE WHEN c.priority = 'Critical' THEN $2::int ELSE $3::int END)
          AND NOT EXISTS (SELECT 1 FROM crd.appointment a WHERE a.case_donor_id = cd.id AND a.confirmed_by_donor_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM crd.case_task t WHERE t.dedupe_key = 'donor-confirm-timeout:' || cd.id)
        ORDER BY cd.joined_at LIMIT 50`,
      [LIVE_CASE_STATUSES, CONFIRM_TIMEOUT_MINUTES.Critical, CONFIRM_TIMEOUT_MINUTES.High],
    );
    for (const r of rows) {
      await this.db.transaction(async (tx) => {
        const confirmed = await tx.query('SELECT 1 FROM crd.appointment WHERE case_donor_id = $1 AND confirmed_by_donor_at IS NOT NULL', [r.id]);
        if (confirmed.rows[0]) return;
        const caseRow = await this.support.loadCase(tx, r.case_id, true);
        await this.support.openTask(tx, caseRow, 'TK_CALLBACK', `donor-confirm-timeout:${r.id}`, 0, r.id);
        await this.support.event(tx, 'CASE_DONOR', r.id, 'DonorConfirmationTimedOut', {
          caseId: r.case_id,
          caseDonorId: r.id,
          requestId: caseRow.request_id,
          donorProfileId: r.donor_profile_id,
        });
      });
    }
    return rows.length;
  }

  async reconcileClosedRequests(): Promise<number> {
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
    const live = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM crd.appointment WHERE case_id = $1 AND status IN ('Proposed','Confirmed')`,
      [row.id],
    );
    for (const a of live.rows) {
      await this.support.moveAppointment(tx, a.id, row.request_id, a.status as 'Proposed' | 'Confirmed', 'Cancelled', { userId: null, role: 'SYSTEM' }, ', cancelled_at = now(), reminders_stopped = true');
    }
    await tx.query(
      `UPDATE crd.case_task SET status = 'Cancelled', version = version + 1, updated_at = now()
        WHERE case_id = $1 AND status IN ('Open','In progress') AND task_type <> 'TK_CLOSE_AND_FOLLOW_UP'`,
      [row.id],
    );
    await this.support.moveCase(tx, row, 'Resolved', { userId: null, role: 'SYSTEM' }, 'Request ended');
  }
}
