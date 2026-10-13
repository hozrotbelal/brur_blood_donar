import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { findTransition, requestStateMachine } from '../request/request.public';
import { AppointmentStatus } from './case-status';
import { CaseService } from './case.service';
import { CaseRow, CaseSupport, fail } from './case.support';
import { ProposeAppointmentDto, RescheduleDto, TimingProblemDto } from './case.dto';

export const ATTENDANCE_GRACE_MINUTES = 60;

interface AppointmentRow {
  id: string;
  case_id: string;
  case_donor_id: string;
  facility_id: string;
  scheduled_start: Date;
  status: AppointmentStatus;
  request_id: string;
  donor_user_id: string;
}

const SELECT = `SELECT a.id, a.case_id, a.case_donor_id, a.facility_id, a.scheduled_start, a.status, c.request_id, d.user_id AS donor_user_id
  FROM crd.appointment a JOIN crd.coordination_case c ON c.id = a.case_id
  JOIN crd.case_donor cd ON cd.id = a.case_donor_id JOIN idn.donor_profile d ON d.id = cd.donor_profile_id`;

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly support: CaseSupport,
    private readonly cases: CaseService,
    private readonly history: StatusHistoryService,
  ) {}

  async propose(principal: Principal, caseId: string, dto: ProposeAppointmentDto) {
    const start = new Date(dto.scheduledStart);
    if (start.getTime() <= Date.now()) throw fail('APPOINTMENT_IN_PAST');
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'appointment.create');
      if (!['Open', 'Scheduling', 'Scheduled'].includes(row.status)) throw fail('INVALID_TRANSITION');
      await this.requireDonorAndFacility(tx, caseId, dto.caseDonorId, dto.facilityId);
      const live = await tx.query('SELECT 1 FROM crd.appointment WHERE case_donor_id = $1 AND status IN (\'Proposed\',\'Confirmed\')', [dto.caseDonorId]);
      if (live.rows[0]) throw fail('APPOINTMENT_EXISTS', HttpStatus.CONFLICT);
      const id = await this.insertProposed(tx, row, dto.caseDonorId, dto.facilityId, start, null, principal.userId);
      if (row.status === 'Open') await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' });
      return this.view(tx, id);
    });
  }

  async reschedule(principal: Principal, appointmentId: string, dto: RescheduleDto) {
    const start = new Date(dto.scheduledStart);
    if (start.getTime() <= Date.now()) throw fail('APPOINTMENT_IN_PAST');
    return this.db.transaction(async (tx) => {
      const appt = await this.lock(tx, appointmentId);
      const row = await this.support.loadCase(tx, appt.case_id, true);
      await this.support.requireAccess(tx, principal, row, 'appointment.edit');
      if (appt.status !== 'Proposed' && appt.status !== 'Confirmed') throw fail('INVALID_TRANSITION');
      const facilityId = dto.facilityId ?? appt.facility_id;
      await this.requireDonorAndFacility(tx, appt.case_id, appt.case_donor_id, facilityId);
      await this.support.moveAppointment(tx, appt.id, appt.request_id, appt.status, 'Rescheduled', { userId: principal.userId, role: 'SUP' }, ', reminders_stopped = true');
      const id = await this.insertProposed(tx, row, appt.case_donor_id, facilityId, start, appt.id, principal.userId);
      if (row.status === 'Scheduled') await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' }, 'Rescheduled');
      return this.view(tx, id);
    });
  }

  async confirm(principal: Principal, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lockOwned(tx, principal, appointmentId);
      if (appt.status !== 'Proposed') throw fail('INVALID_TRANSITION');
      const row = await this.support.loadCase(tx, appt.case_id, true);
      await this.support.moveAppointment(tx, appt.id, appt.request_id, 'Proposed', 'Confirmed', { userId: principal.userId, role: 'DON' }, ', confirmed_by_donor_at = now()');
      if (row.status === 'Scheduling') await this.support.moveCase(tx, row, 'Scheduled', { userId: principal.userId, role: 'DON' }, 'Appointment confirmed');
      await this.support.event(tx, 'APPOINTMENT', appt.id, 'AppointmentConfirmed', { caseId: appt.case_id });
      return this.view(tx, appt.id);
    });
  }

  async reportTimingProblem(principal: Principal, appointmentId: string, dto: TimingProblemDto) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lockOwned(tx, principal, appointmentId);
      if (appt.status !== 'Proposed' && appt.status !== 'Confirmed') throw fail('INVALID_TRANSITION');
      const row = await this.support.loadCase(tx, appt.case_id, false);
      await this.support.openTask(tx, row, 'TK_RESOLVE_TRAVEL_TIMING', `timing:${appt.id}`, 60, appt.case_donor_id);
      if (dto.note) await tx.query(`INSERT INTO crd.case_note (case_id, author_user_id, note_type, body) VALUES ($1, $2, 'GENERAL', $3)`, [appt.case_id, principal.userId, dto.note]);
      await this.support.event(tx, 'APPOINTMENT', appt.id, 'TimingProblemReported', { caseId: appt.case_id }, Date.now());
      return { reported: true };
    });
  }

  async recordNoShow(principal: Principal, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lock(tx, appointmentId);
      const row = await this.support.loadCase(tx, appt.case_id, true);
      await this.support.requireAccess(tx, principal, row, 'appointment.edit');
      if (appt.status !== 'Confirmed') throw fail('INVALID_TRANSITION');
      if (Date.now() < appt.scheduled_start.getTime() + ATTENDANCE_GRACE_MINUTES * 60_000) throw fail('GRACE_PERIOD_NOT_OVER');
      await this.support.moveAppointment(tx, appt.id, appt.request_id, 'Confirmed', 'No-show', { userId: principal.userId, role: 'SUP' }, ', no_show_marked_at = now(), reminders_stopped = true');
      await this.cases.handleDonorLeft(tx, { caseDonorId: appt.case_donor_id, kind: 'NO_SHOW', actorUserId: principal.userId, actorRole: 'SUP' });
      return this.view(tx, appt.id);
    });
  }

  async reportDonation(principal: Principal, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lockOwned(tx, principal, appointmentId);
      if (appt.status === 'Attended (reported)') return this.view(tx, appt.id);
      if (appt.status !== 'Confirmed' && appt.status !== 'Checked-in') throw fail('INVALID_TRANSITION');
      if (appt.scheduled_start.getTime() > Date.now()) throw fail('APPOINTMENT_NOT_STARTED');
      let row = await this.support.loadCase(tx, appt.case_id, true);
      await this.support.moveAppointment(tx, appt.id, appt.request_id, appt.status, 'Attended (reported)', { userId: principal.userId, role: 'DON' }, ', attended_reported_at = now()');
      if (row.status === 'Scheduled') row = await this.support.moveCase(tx, row, 'Attendance pending', { userId: null, role: 'SYSTEM' }, 'Donation reported');
      if (row.status === 'Attendance pending') await this.support.moveCase(tx, row, 'Outcome pending', { userId: principal.userId, role: 'DON' }, 'Donation reported');
      await tx.query(
        `INSERT INTO crd.outcome_update (case_id, request_id, case_donor_id, appointment_id, outcome_type, source_type, confidence, reported_by_user_id,
                                         facility_id, channel, reported_at, units_count)
         VALUES ($1, $2, $3, $4, 'DONATION_COMPLETED', 'DONOR_SELF_REPORT', 'Self-reported', $5, $6, 'IN_APP', now(), 1)`,
        [appt.case_id, appt.request_id, appt.case_donor_id, appt.id, principal.userId, appt.facility_id],
      );
      await this.markDonationReported(tx, appt.request_id);
      await this.support.finishTask(tx, appt.case_id, 'TK_CONFIRM_DONOR_ATTENDANCE', null);
      await this.support.event(tx, 'APPOINTMENT', appt.id, 'DonationReported', { caseId: appt.case_id });
      return this.view(tx, appt.id);
    });
  }

  async listForDonor(principal: Principal) {
    const { rows } = await this.db.query<AppointmentRow & { facility_name: string; facility_phone: string | null; lat: number | null; lon: number | null }>(
      `${SELECT.replace('d.user_id AS donor_user_id', 'd.user_id AS donor_user_id, f.name_en AS facility_name, f.contact_phone AS facility_phone, ST_Y(f.location::geometry) AS lat, ST_X(f.location::geometry) AS lon')}
       JOIN apt.facility f ON f.id = a.facility_id
       WHERE d.user_id = $1 AND a.status <> 'Rescheduled' ORDER BY a.scheduled_start DESC LIMIT 50`,
      [principal.userId],
    );
    return rows.map((r) => ({
      id: r.id, status: r.status, scheduledStart: r.scheduled_start,
      facility: {
        id: r.facility_id, name: r.facility_name, phone: r.facility_phone,
        directionsUrl: r.lat === null ? null : `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}`,
      },
    }));
  }

  private async markDonationReported(tx: Db, requestId: string) {
    const r = await tx.query<{ status: string }>('SELECT status FROM req.blood_request WHERE id = $1 FOR UPDATE', [requestId]);
    await tx.query('UPDATE req.blood_request SET donation_reported_at = COALESCE(donation_reported_at, now()) WHERE id = $1', [requestId]);
    if (r.rows[0]?.status !== 'Donor coordination' || !findTransition('Donor coordination', 'attendance_reported')) return;
    await tx.query(`UPDATE req.blood_request SET status = 'Awaiting outcome', version = version + 1, updated_at = now() WHERE id = $1`, [requestId]);
    await this.history.record(
      tx,
      {
        entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Donor coordination', to: 'Awaiting outcome', actorUserId: null, actorRole: 'SYSTEM',
        source: 'SYSTEM', contextRequestId: requestId, reasonCode: 'DONATION_REPORTED', correlationId: randomUUID(),
      },
      requestStateMachine,
    );
  }

  private async requireDonorAndFacility(tx: Db, caseId: string, caseDonorId: string, facilityId: string) {
    const donor = await tx.query('SELECT 1 FROM crd.case_donor WHERE id = $1 AND case_id = $2 AND status = \'Active\'', [caseDonorId, caseId]);
    if (!donor.rows[0]) throw new NotFoundException({ code: 'CASE_DONOR_NOT_FOUND' });
    const facility = await tx.query("SELECT 1 FROM apt.facility WHERE id = $1 AND status = 'Active'", [facilityId]);
    if (!facility.rows[0]) throw new NotFoundException({ code: 'FACILITY_NOT_FOUND' });
  }

  private async insertProposed(tx: Db, row: CaseRow, caseDonorId: string, facilityId: string, start: Date, previous: string | null, userId: string) {
    const created = await tx.query<{ id: string }>(
      `INSERT INTO crd.appointment (case_id, case_donor_id, facility_id, scheduled_start, status, previous_appointment_id)
       VALUES ($1, $2, $3, $4, 'Proposed', $5) RETURNING id`,
      [row.id, caseDonorId, facilityId, start, previous],
    );
    const id = created.rows[0].id;
    await this.history.record(tx, {
      entityType: 'APPOINTMENT', entityId: id, from: null, to: 'Proposed', actorUserId: userId, actorRole: 'SUP', source: 'USER',
      contextRequestId: row.request_id, correlationId: randomUUID(),
    });
    await this.support.event(tx, 'APPOINTMENT', id, 'AppointmentProposed', { caseId: row.id });
    return id;
  }

  private async lock(tx: Db, id: string): Promise<AppointmentRow> {
    const { rows } = await tx.query<AppointmentRow>(`${SELECT} WHERE a.id = $1 FOR UPDATE OF a`, [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
    return rows[0];
  }

  private async lockOwned(tx: Db, principal: Principal, id: string): Promise<AppointmentRow> {
    const appt = await this.lock(tx, id);
    if (appt.donor_user_id !== principal.userId) throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
    return appt;
  }

  private async view(db: Db, id: string) {
    const { rows } = await db.query<{ id: string; status: string; scheduled_start: Date; facility_id: string; case_id: string; previous_appointment_id: string | null }>(
      'SELECT id, status, scheduled_start, facility_id, case_id, previous_appointment_id FROM crd.appointment WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return { id: r.id, caseId: r.case_id, status: r.status, scheduledStart: r.scheduled_start, facilityId: r.facility_id, previousAppointmentId: r.previous_appointment_id };
  }
}
