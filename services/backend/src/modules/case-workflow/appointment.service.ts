import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { isActiveFacility } from '../appointments/read-model.public';
import { donorProfileIdOf } from '../identity/read-model.public';
import { markDonationReported } from '../request/request.public';
import { AppointmentStatus } from './case-status';
import { CaseService } from './case.service';
import { CaseRow, CaseSupport, fail } from './case.support';
import { ProposeAppointmentDto, RescheduleDto, TimingProblemDto } from './case.dto';
import { appointment, caseDonor, coordinationCase, outcomeUpdate } from './schema';

export const ATTENDANCE_GRACE_MINUTES = 60;

interface AppointmentRow {
  id: string;
  caseId: string;
  caseDonorId: string;
  facilityId: string;
  scheduledStart: Date;
  status: AppointmentStatus;
  requestId: string;
  donorProfileId: string;
}

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
      const [live] = await tx.orm
        .select({ id: appointment.id })
        .from(appointment)
        .where(and(eq(appointment.caseDonorId, dto.caseDonorId), inArray(appointment.status, ['Proposed', 'Confirmed'])))
        .limit(1);
      if (live) throw fail('APPOINTMENT_EXISTS', HttpStatus.CONFLICT);
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
      const row = await this.support.loadCase(tx, appt.caseId, true);
      await this.support.requireAccess(tx, principal, row, 'appointment.edit');
      if (appt.status !== 'Proposed' && appt.status !== 'Confirmed') throw fail('INVALID_TRANSITION');
      const facilityId = dto.facilityId ?? appt.facilityId;
      await this.requireDonorAndFacility(tx, appt.caseId, appt.caseDonorId, facilityId);
      await this.support.moveAppointment(tx, appt.id, appt.requestId, appt.status, 'Rescheduled', { userId: principal.userId, role: 'SUP' }, { remindersStopped: true });
      const id = await this.insertProposed(tx, row, appt.caseDonorId, facilityId, start, appt.id, principal.userId);
      if (row.status === 'Scheduled') await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' }, 'Rescheduled');
      return this.view(tx, id);
    });
  }

  async confirm(principal: Principal, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lockOwned(tx, principal, appointmentId);
      if (appt.status !== 'Proposed') throw fail('INVALID_TRANSITION');
      const row = await this.support.loadCase(tx, appt.caseId, true);
      await this.support.moveAppointment(tx, appt.id, appt.requestId, 'Proposed', 'Confirmed', { userId: principal.userId, role: 'DON' }, { confirmedByDonorAt: sql`now()` });
      if (row.status === 'Scheduling') await this.support.moveCase(tx, row, 'Scheduled', { userId: principal.userId, role: 'DON' }, 'Appointment confirmed');
      await this.support.event(tx, 'APPOINTMENT', appt.id, 'AppointmentConfirmed', { caseId: appt.caseId });
      return this.view(tx, appt.id);
    });
  }

  async reportTimingProblem(principal: Principal, appointmentId: string, dto: TimingProblemDto) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lockOwned(tx, principal, appointmentId);
      if (appt.status !== 'Proposed' && appt.status !== 'Confirmed') throw fail('INVALID_TRANSITION');
      const row = await this.support.loadCase(tx, appt.caseId, false);
      await this.support.openTask(tx, row, 'TK_RESOLVE_TRAVEL_TIMING', `timing:${appt.id}`, 60, appt.caseDonorId);
      if (dto.note) await this.cases.insertNote(tx, appt.caseId, principal.userId, 'GENERAL', dto.note);
      await this.support.event(tx, 'APPOINTMENT', appt.id, 'TimingProblemReported', { caseId: appt.caseId }, Date.now());
      return { reported: true };
    });
  }

  async recordNoShow(principal: Principal, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lock(tx, appointmentId);
      const row = await this.support.loadCase(tx, appt.caseId, true);
      await this.support.requireAccess(tx, principal, row, 'appointment.edit');
      if (appt.status !== 'Confirmed') throw fail('INVALID_TRANSITION');
      if (Date.now() < appt.scheduledStart.getTime() + ATTENDANCE_GRACE_MINUTES * 60_000) throw fail('GRACE_PERIOD_NOT_OVER');
      await this.support.moveAppointment(tx, appt.id, appt.requestId, 'Confirmed', 'No-show', { userId: principal.userId, role: 'SUP' }, { noShowMarkedAt: sql`now()`, remindersStopped: true });
      await this.cases.handleDonorLeft(tx, { caseDonorId: appt.caseDonorId, kind: 'NO_SHOW', actorUserId: principal.userId, actorRole: 'SUP' });
      return this.view(tx, appt.id);
    });
  }

  async reportDonation(principal: Principal, appointmentId: string) {
    return this.db.transaction(async (tx) => {
      const appt = await this.lockOwned(tx, principal, appointmentId);
      if (appt.status === 'Attended (reported)') return this.view(tx, appt.id);
      if (appt.status !== 'Confirmed' && appt.status !== 'Checked-in') throw fail('INVALID_TRANSITION');
      if (appt.scheduledStart.getTime() > Date.now()) throw fail('APPOINTMENT_NOT_STARTED');
      let row = await this.support.loadCase(tx, appt.caseId, true);
      await this.support.moveAppointment(tx, appt.id, appt.requestId, appt.status, 'Attended (reported)', { userId: principal.userId, role: 'DON' }, { attendedReportedAt: sql`now()` });
      if (row.status === 'Scheduled') row = await this.support.moveCase(tx, row, 'Attendance pending', { userId: null, role: 'SYSTEM' }, 'Donation reported');
      if (row.status === 'Attendance pending') await this.support.moveCase(tx, row, 'Outcome pending', { userId: principal.userId, role: 'DON' }, 'Donation reported');
      await tx.orm.insert(outcomeUpdate).values({
        caseId: appt.caseId, requestId: appt.requestId, caseDonorId: appt.caseDonorId, appointmentId: appt.id, outcomeType: 'DONATION_COMPLETED',
        sourceType: 'DONOR_SELF_REPORT', confidence: 'Self-reported', reportedByUserId: principal.userId, facilityId: appt.facilityId, channel: 'IN_APP',
        reportedAt: sql`now()`, unitsCount: 1,
      });
      await markDonationReported(tx, this.history, appt.requestId, { userId: null, role: 'SYSTEM' }, 'DONATION_REPORTED');
      await this.support.finishTask(tx, appt.caseId, 'TK_CONFIRM_DONOR_ATTENDANCE', null);
      await this.support.event(tx, 'APPOINTMENT', appt.id, 'DonationReported', { caseId: appt.caseId });
      return this.view(tx, appt.id);
    });
  }

  async listForDonor(principal: Principal) {
    // Raw SQL: PostGIS facility coordinates joined across identity and appointments (ADR-16 rule 6).
    const { rows } = await this.db.query<{ id: string; status: string; scheduled_start: Date; facility_id: string; facility_name: string; facility_phone: string | null; lat: number | null; lon: number | null }>(
      `SELECT a.id, a.status, a.scheduled_start, a.facility_id, f.name_en AS facility_name, f.contact_phone AS facility_phone,
              ST_Y(f.location::geometry) AS lat, ST_X(f.location::geometry) AS lon
         FROM crd.appointment a JOIN crd.case_donor cd ON cd.id = a.case_donor_id JOIN idn.donor_profile d ON d.id = cd.donor_profile_id
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

  private async requireDonorAndFacility(tx: Db, caseId: string, caseDonorId: string, facilityId: string) {
    const [donor] = await tx.orm
      .select({ id: caseDonor.id })
      .from(caseDonor)
      .where(and(eq(caseDonor.id, caseDonorId), eq(caseDonor.caseId, caseId), eq(caseDonor.status, 'Active')));
    if (!donor) throw new NotFoundException({ code: 'CASE_DONOR_NOT_FOUND' });
    if (!(await isActiveFacility(tx, facilityId))) throw new NotFoundException({ code: 'FACILITY_NOT_FOUND' });
  }

  private async insertProposed(tx: Db, row: CaseRow, caseDonorId: string, facilityId: string, start: Date, previous: string | null, userId: string) {
    const [created] = await tx.orm
      .insert(appointment)
      .values({ caseId: row.id, caseDonorId, facilityId, scheduledStart: start, status: 'Proposed', previousAppointmentId: previous })
      .returning({ id: appointment.id });
    await this.history.record(tx, {
      entityType: 'APPOINTMENT', entityId: created.id, from: null, to: 'Proposed', actorUserId: userId, actorRole: 'SUP', source: 'USER',
      contextRequestId: row.requestId, correlationId: randomUUID(),
    });
    await this.support.event(tx, 'APPOINTMENT', created.id, 'AppointmentProposed', { caseId: row.id });
    return created.id;
  }

  private async lock(tx: Db, id: string): Promise<AppointmentRow> {
    const [appt] = await tx.orm
      .select({
        id: appointment.id, caseId: appointment.caseId, caseDonorId: appointment.caseDonorId, facilityId: appointment.facilityId,
        scheduledStart: appointment.scheduledStart, status: appointment.status,
      })
      .from(appointment)
      .where(eq(appointment.id, id))
      .for('update');
    if (!appt) throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
    const [owner] = await tx.orm
      .select({ requestId: coordinationCase.requestId, donorProfileId: caseDonor.donorProfileId })
      .from(caseDonor)
      .innerJoin(coordinationCase, eq(coordinationCase.id, appt.caseId))
      .where(eq(caseDonor.id, appt.caseDonorId));
    if (!owner) throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
    return { ...appt, status: appt.status as AppointmentStatus, ...owner };
  }

  private async lockOwned(tx: Db, principal: Principal, id: string): Promise<AppointmentRow> {
    const appt = await this.lock(tx, id);
    if (appt.donorProfileId !== (await donorProfileIdOf(tx, principal.userId))) throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
    return appt;
  }

  private async view(db: Db, id: string) {
    const [r] = await db.orm
      .select({
        id: appointment.id, caseId: appointment.caseId, status: appointment.status, scheduledStart: appointment.scheduledStart,
        facilityId: appointment.facilityId, previousAppointmentId: appointment.previousAppointmentId,
      })
      .from(appointment)
      .where(eq(appointment.id, id));
    return r;
  }
}
