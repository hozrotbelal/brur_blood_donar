"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentService = exports.ATTENDANCE_GRACE_MINUTES = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const read_model_public_1 = require("../appointments/read-model.public");
const read_model_public_2 = require("../identity/read-model.public");
const request_public_1 = require("../request/request.public");
const case_service_1 = require("./case.service");
const case_support_1 = require("./case.support");
const schema_1 = require("./schema");
exports.ATTENDANCE_GRACE_MINUTES = 60;
let AppointmentService = class AppointmentService {
    db;
    support;
    cases;
    history;
    constructor(db, support, cases, history) {
        this.db = db;
        this.support = support;
        this.cases = cases;
        this.history = history;
    }
    async propose(principal, caseId, dto) {
        const start = new Date(dto.scheduledStart);
        if (start.getTime() <= Date.now())
            throw (0, case_support_1.fail)('APPOINTMENT_IN_PAST');
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'appointment.create');
            if (!['Open', 'Scheduling', 'Scheduled'].includes(row.status))
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            await this.requireDonorAndFacility(tx, caseId, dto.caseDonorId, dto.facilityId);
            const [live] = await tx.orm
                .select({ id: schema_1.appointment.id })
                .from(schema_1.appointment)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appointment.caseDonorId, dto.caseDonorId), (0, drizzle_orm_1.inArray)(schema_1.appointment.status, ['Proposed', 'Confirmed'])))
                .limit(1);
            if (live)
                throw (0, case_support_1.fail)('APPOINTMENT_EXISTS', common_1.HttpStatus.CONFLICT);
            const id = await this.insertProposed(tx, row, dto.caseDonorId, dto.facilityId, start, null, principal.userId);
            if (row.status === 'Open')
                await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' });
            return this.view(tx, id);
        });
    }
    async reschedule(principal, appointmentId, dto) {
        const start = new Date(dto.scheduledStart);
        if (start.getTime() <= Date.now())
            throw (0, case_support_1.fail)('APPOINTMENT_IN_PAST');
        return this.db.transaction(async (tx) => {
            const appt = await this.lock(tx, appointmentId);
            const row = await this.support.loadCase(tx, appt.caseId, true);
            await this.support.requireAccess(tx, principal, row, 'appointment.edit');
            if (appt.status !== 'Proposed' && appt.status !== 'Confirmed')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            const facilityId = dto.facilityId ?? appt.facilityId;
            await this.requireDonorAndFacility(tx, appt.caseId, appt.caseDonorId, facilityId);
            await this.support.moveAppointment(tx, appt.id, appt.requestId, appt.status, 'Rescheduled', { userId: principal.userId, role: 'SUP' }, { remindersStopped: true });
            const id = await this.insertProposed(tx, row, appt.caseDonorId, facilityId, start, appt.id, principal.userId);
            if (row.status === 'Scheduled')
                await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' }, 'Rescheduled');
            return this.view(tx, id);
        });
    }
    async confirm(principal, appointmentId) {
        return this.db.transaction(async (tx) => {
            const appt = await this.lockOwned(tx, principal, appointmentId);
            if (appt.status !== 'Proposed')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            const row = await this.support.loadCase(tx, appt.caseId, true);
            await this.support.moveAppointment(tx, appt.id, appt.requestId, 'Proposed', 'Confirmed', { userId: principal.userId, role: 'DON' }, { confirmedByDonorAt: (0, drizzle_orm_1.sql) `now()` });
            if (row.status === 'Scheduling')
                await this.support.moveCase(tx, row, 'Scheduled', { userId: principal.userId, role: 'DON' }, 'Appointment confirmed');
            await this.support.event(tx, 'APPOINTMENT', appt.id, 'AppointmentConfirmed', { caseId: appt.caseId });
            return this.view(tx, appt.id);
        });
    }
    async reportTimingProblem(principal, appointmentId, dto) {
        return this.db.transaction(async (tx) => {
            const appt = await this.lockOwned(tx, principal, appointmentId);
            if (appt.status !== 'Proposed' && appt.status !== 'Confirmed')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            const row = await this.support.loadCase(tx, appt.caseId, false);
            await this.support.openTask(tx, row, 'TK_RESOLVE_TRAVEL_TIMING', `timing:${appt.id}`, 60, appt.caseDonorId);
            if (dto.note)
                await this.cases.insertNote(tx, appt.caseId, principal.userId, 'GENERAL', dto.note);
            await this.support.event(tx, 'APPOINTMENT', appt.id, 'TimingProblemReported', { caseId: appt.caseId }, Date.now());
            return { reported: true };
        });
    }
    async recordNoShow(principal, appointmentId) {
        return this.db.transaction(async (tx) => {
            const appt = await this.lock(tx, appointmentId);
            const row = await this.support.loadCase(tx, appt.caseId, true);
            await this.support.requireAccess(tx, principal, row, 'appointment.edit');
            if (appt.status !== 'Confirmed')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            if (Date.now() < appt.scheduledStart.getTime() + exports.ATTENDANCE_GRACE_MINUTES * 60_000)
                throw (0, case_support_1.fail)('GRACE_PERIOD_NOT_OVER');
            await this.support.moveAppointment(tx, appt.id, appt.requestId, 'Confirmed', 'No-show', { userId: principal.userId, role: 'SUP' }, { noShowMarkedAt: (0, drizzle_orm_1.sql) `now()`, remindersStopped: true });
            await this.cases.handleDonorLeft(tx, { caseDonorId: appt.caseDonorId, kind: 'NO_SHOW', actorUserId: principal.userId, actorRole: 'SUP' });
            return this.view(tx, appt.id);
        });
    }
    async reportDonation(principal, appointmentId) {
        return this.db.transaction(async (tx) => {
            const appt = await this.lockOwned(tx, principal, appointmentId);
            if (appt.status === 'Attended (reported)')
                return this.view(tx, appt.id);
            if (appt.status !== 'Confirmed' && appt.status !== 'Checked-in')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            if (appt.scheduledStart.getTime() > Date.now())
                throw (0, case_support_1.fail)('APPOINTMENT_NOT_STARTED');
            let row = await this.support.loadCase(tx, appt.caseId, true);
            await this.support.moveAppointment(tx, appt.id, appt.requestId, appt.status, 'Attended (reported)', { userId: principal.userId, role: 'DON' }, { attendedReportedAt: (0, drizzle_orm_1.sql) `now()` });
            if (row.status === 'Scheduled')
                row = await this.support.moveCase(tx, row, 'Attendance pending', { userId: null, role: 'SYSTEM' }, 'Donation reported');
            if (row.status === 'Attendance pending')
                await this.support.moveCase(tx, row, 'Outcome pending', { userId: principal.userId, role: 'DON' }, 'Donation reported');
            await tx.orm.insert(schema_1.outcomeUpdate).values({
                caseId: appt.caseId, requestId: appt.requestId, caseDonorId: appt.caseDonorId, appointmentId: appt.id, outcomeType: 'DONATION_COMPLETED',
                sourceType: 'DONOR_SELF_REPORT', confidence: 'Self-reported', reportedByUserId: principal.userId, facilityId: appt.facilityId, channel: 'IN_APP',
                reportedAt: (0, drizzle_orm_1.sql) `now()`, unitsCount: 1,
            });
            await (0, request_public_1.markDonationReported)(tx, this.history, appt.requestId, { userId: null, role: 'SYSTEM' }, 'DONATION_REPORTED');
            await this.support.finishTask(tx, appt.caseId, 'TK_CONFIRM_DONOR_ATTENDANCE', null);
            await this.support.event(tx, 'APPOINTMENT', appt.id, 'DonationReported', { caseId: appt.caseId });
            return this.view(tx, appt.id);
        });
    }
    async listForDonor(principal) {
        // Raw SQL: PostGIS facility coordinates joined across identity and appointments (ADR-16 rule 6).
        const { rows } = await this.db.query(`SELECT a.id, a.status, a.scheduled_start, a.facility_id, f.name_en AS facility_name, f.contact_phone AS facility_phone,
              ST_Y(f.location::geometry) AS lat, ST_X(f.location::geometry) AS lon
         FROM crd.appointment a JOIN crd.case_donor cd ON cd.id = a.case_donor_id JOIN idn.donor_profile d ON d.id = cd.donor_profile_id
         JOIN apt.facility f ON f.id = a.facility_id
        WHERE d.user_id = $1 AND a.status <> 'Rescheduled' ORDER BY a.scheduled_start DESC LIMIT 50`, [principal.userId]);
        return rows.map((r) => ({
            id: r.id, status: r.status, scheduledStart: r.scheduled_start,
            facility: {
                id: r.facility_id, name: r.facility_name, phone: r.facility_phone,
                directionsUrl: r.lat === null ? null : `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}`,
            },
        }));
    }
    async requireDonorAndFacility(tx, caseId, caseDonorId, facilityId) {
        const [donor] = await tx.orm
            .select({ id: schema_1.caseDonor.id })
            .from(schema_1.caseDonor)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.id, caseDonorId), (0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.caseDonor.status, 'Active')));
        if (!donor)
            throw new common_1.NotFoundException({ code: 'CASE_DONOR_NOT_FOUND' });
        if (!(await (0, read_model_public_1.isActiveFacility)(tx, facilityId)))
            throw new common_1.NotFoundException({ code: 'FACILITY_NOT_FOUND' });
    }
    async insertProposed(tx, row, caseDonorId, facilityId, start, previous, userId) {
        const [created] = await tx.orm
            .insert(schema_1.appointment)
            .values({ caseId: row.id, caseDonorId, facilityId, scheduledStart: start, status: 'Proposed', previousAppointmentId: previous })
            .returning({ id: schema_1.appointment.id });
        await this.history.record(tx, {
            entityType: 'APPOINTMENT', entityId: created.id, from: null, to: 'Proposed', actorUserId: userId, actorRole: 'SUP', source: 'USER',
            contextRequestId: row.requestId, correlationId: (0, node_crypto_1.randomUUID)(),
        });
        await this.support.event(tx, 'APPOINTMENT', created.id, 'AppointmentProposed', { caseId: row.id });
        return created.id;
    }
    async lock(tx, id) {
        const [appt] = await tx.orm
            .select({
            id: schema_1.appointment.id, caseId: schema_1.appointment.caseId, caseDonorId: schema_1.appointment.caseDonorId, facilityId: schema_1.appointment.facilityId,
            scheduledStart: schema_1.appointment.scheduledStart, status: schema_1.appointment.status,
        })
            .from(schema_1.appointment)
            .where((0, drizzle_orm_1.eq)(schema_1.appointment.id, id))
            .for('update');
        if (!appt)
            throw new common_1.NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
        const [owner] = await tx.orm
            .select({ requestId: schema_1.coordinationCase.requestId, donorProfileId: schema_1.caseDonor.donorProfileId })
            .from(schema_1.caseDonor)
            .innerJoin(schema_1.coordinationCase, (0, drizzle_orm_1.eq)(schema_1.coordinationCase.id, appt.caseId))
            .where((0, drizzle_orm_1.eq)(schema_1.caseDonor.id, appt.caseDonorId));
        if (!owner)
            throw new common_1.NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
        return { ...appt, status: appt.status, ...owner };
    }
    async lockOwned(tx, principal, id) {
        const appt = await this.lock(tx, id);
        if (appt.donorProfileId !== (await (0, read_model_public_2.donorProfileIdOf)(tx, principal.userId)))
            throw new common_1.NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
        return appt;
    }
    async view(db, id) {
        const [r] = await db.orm
            .select({
            id: schema_1.appointment.id, caseId: schema_1.appointment.caseId, status: schema_1.appointment.status, scheduledStart: schema_1.appointment.scheduledStart,
            facilityId: schema_1.appointment.facilityId, previousAppointmentId: schema_1.appointment.previousAppointmentId,
        })
            .from(schema_1.appointment)
            .where((0, drizzle_orm_1.eq)(schema_1.appointment.id, id));
        return r;
    }
};
exports.AppointmentService = AppointmentService;
exports.AppointmentService = AppointmentService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        case_support_1.CaseSupport,
        case_service_1.CaseService,
        status_history_service_1.StatusHistoryService])
], AppointmentService);
//# sourceMappingURL=appointment.service.js.map