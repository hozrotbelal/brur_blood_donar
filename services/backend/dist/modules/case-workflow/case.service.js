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
exports.CaseService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const read_model_public_1 = require("../appointments/read-model.public");
const read_model_public_2 = require("../identity/read-model.public");
const request_public_1 = require("../request/request.public");
const read_model_public_3 = require("../request/read-model.public");
const case_support_1 = require("./case.support");
const case_status_1 = require("./case-status");
const schema_1 = require("./schema");
const DUE_MINUTES = { Critical: 120, High: 360, Normal: 1440 };
const FOLLOW_UP_EXTRA_MINUTES = 4320;
const CONFIRM_TIMEOUT_MINUTES = { Critical: 15, High: 60, Normal: 60 };
let CaseService = class CaseService {
    db;
    support;
    history;
    constructor(db, support, history) {
        this.db = db;
        this.support = support;
        this.history = history;
    }
    async linkAvailableDonor(tx, input) {
        const r = await (0, request_public_1.requestState)(tx, input.requestId);
        if (!r)
            return;
        let [caseRow] = (await tx.orm.select(case_support_1.CASE_COLUMNS).from(schema_1.coordinationCase).where((0, drizzle_orm_1.eq)(schema_1.coordinationCase.requestId, input.requestId)).for('update'));
        if (!caseRow) {
            const priority = r.urgency === 'Critical' ? 'Critical' : r.urgency === 'Urgent' ? 'High' : 'Normal';
            [caseRow] = (await tx.orm
                .insert(schema_1.coordinationCase)
                .values({
                caseNo: (0, drizzle_orm_1.sql) `'CASE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('crd.coordination_case_no_seq')::text, 6, '0')`,
                requestId: input.requestId, status: 'Open', ownerUserId: r.assignedSupportUserId, priority, areaId: r.areaId, openedAt: (0, drizzle_orm_1.sql) `now()`,
            })
                .returning(case_support_1.CASE_COLUMNS));
            await this.history.record(tx, {
                entityType: 'COORDINATION_CASE', entityId: caseRow.id, from: null, to: 'Open', actorUserId: null, actorRole: 'SYSTEM',
                source: 'SYSTEM', contextRequestId: input.requestId, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            const due = DUE_MINUTES[priority];
            await this.support.openTask(tx, caseRow, 'TK_CONFIRM_DONOR_ATTENDANCE', `attendance:${caseRow.id}`, due);
            await this.support.openTask(tx, caseRow, 'TK_CONFIRM_REPRESENTATIVE_NEXT_STEP', `representative:${caseRow.id}`, due);
            await this.support.openTask(tx, caseRow, 'TK_OBTAIN_SOURCED_OUTCOME', `outcome:${caseRow.id}`, due * 2);
            await this.support.openTask(tx, caseRow, 'TK_CLOSE_AND_FOLLOW_UP', `close:${caseRow.id}`, due * 2 + FOLLOW_UP_EXTRA_MINUTES);
            await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'CaseCreated', { requestId: input.requestId, caseNo: caseRow.caseNo });
        }
        else if (caseRow.status === 'Needs replacement') {
            caseRow = await this.support.moveCase(tx, caseRow, 'Open', { userId: null, role: 'SYSTEM' }, 'Replacement donor available');
        }
        else if (!case_status_1.LIVE_CASE_STATUSES.includes(caseRow.status)) {
            return;
        }
        const [linked] = await tx.orm
            .insert(schema_1.caseDonor)
            .values({ caseId: caseRow.id, donorProfileId: input.donorProfileId, invitationId: input.invitationId, status: 'Active', joinedAt: (0, drizzle_orm_1.sql) `now()` })
            .onConflictDoNothing()
            .returning({ id: schema_1.caseDonor.id });
        if (linked) {
            await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'DonorLinked', { caseDonorId: linked.id }, Date.now());
        }
    }
    async handleDonorLeft(tx, input) {
        const [donor] = await tx.orm
            .select({ id: schema_1.caseDonor.id, caseId: schema_1.caseDonor.caseId, status: schema_1.caseDonor.status })
            .from(schema_1.caseDonor)
            .where(input.caseDonorId ? (0, drizzle_orm_1.eq)(schema_1.caseDonor.id, input.caseDonorId) : (0, drizzle_orm_1.eq)(schema_1.caseDonor.invitationId, input.invitationId))
            .for('update');
        if (!donor || donor.status !== 'Active')
            return;
        const caseRow = await this.support.loadCase(tx, donor.caseId, true);
        const actor = { userId: input.actorUserId, role: input.actorRole };
        const newStatus = input.kind === 'WITHDRAWN' ? 'Withdrawn' : input.kind === 'NO_SHOW' ? 'No-show' : 'Released';
        await tx.orm
            .update(schema_1.caseDonor)
            .set({
            status: newStatus,
            ...(newStatus === 'Withdrawn' ? { withdrawnAt: (0, drizzle_orm_1.sql) `now()` } : newStatus === 'Released' ? { releasedAt: (0, drizzle_orm_1.sql) `now()` } : {}),
            version: (0, drizzle_orm_1.sql) `${schema_1.caseDonor.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()`,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.caseDonor.id, donor.id));
        const live = await tx.orm
            .select({ id: schema_1.appointment.id, status: schema_1.appointment.status })
            .from(schema_1.appointment)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appointment.caseDonorId, donor.id), (0, drizzle_orm_1.inArray)(schema_1.appointment.status, ['Proposed', 'Confirmed', 'Checked-in'])));
        for (const a of live) {
            if (a.status === 'Checked-in')
                continue;
            await this.support.moveAppointment(tx, a.id, caseRow.requestId, a.status, 'Cancelled', actor, { cancelledAt: (0, drizzle_orm_1.sql) `now()`, remindersStopped: true });
        }
        const [others] = await tx.orm.select({ n: (0, drizzle_orm_1.count)() }).from(schema_1.caseDonor).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseRow.id), (0, drizzle_orm_1.eq)(schema_1.caseDonor.status, 'Active')));
        if (others.n === 0) {
            if (case_status_1.LIVE_CASE_STATUSES.includes(caseRow.status) && caseRow.status !== 'Needs replacement' && caseRow.status !== 'Outcome pending') {
                await this.support.moveCase(tx, caseRow, 'Needs replacement', actor, input.kind);
            }
            const request = await (0, request_public_1.requestState)(tx, caseRow.requestId, true);
            if (request?.status === 'Donor coordination')
                await (0, request_public_1.returnToSearching)(tx, this.history, caseRow.requestId, 'Donor coordination', actor, input.kind);
        }
        await this.support.openTask(tx, caseRow, 'TK_HANDLE_WITHDRAWAL_NOSHOW', `leave:${donor.id}`, DUE_MINUTES[caseRow.priority] ?? 1440, donor.id);
        await this.support.event(tx, 'COORDINATION_CASE', caseRow.id, 'DonorLeftCase', { caseDonorId: donor.id, kind: input.kind }, Date.now());
    }
    async list(principal) {
        const rows = await this.db.orm
            .select({
            id: schema_1.coordinationCase.id, caseNo: schema_1.coordinationCase.caseNo, status: schema_1.coordinationCase.status, priority: schema_1.coordinationCase.priority,
            requestId: schema_1.coordinationCase.requestId, openedAt: schema_1.coordinationCase.openedAt, overdue: schema_1.coordinationCase.isOverdue,
        })
            .from(schema_1.coordinationCase)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coordinationCase.ownerUserId, principal.userId), (0, drizzle_orm_1.ne)(schema_1.coordinationCase.status, 'Closed')))
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `${schema_1.coordinationCase.priority} = 'Critical'`), (0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `${schema_1.coordinationCase.priority} = 'High'`), (0, drizzle_orm_1.asc)(schema_1.coordinationCase.openedAt))
            .limit(100);
        const routing = await (0, read_model_public_3.requestRouting)(this.db, rows.map((c) => c.requestId));
        return rows.map((c) => ({ ...c, requestReference: routing.get(c.requestId)?.referenceNo ?? null }));
    }
    async detail(principal, caseId) {
        const row = await this.support.loadCase(this.db, caseId, false);
        await this.support.requireAccess(this.db, principal, row, 'case.view');
        const orm = this.db.orm;
        const [donorRows, appointmentRows, tasks, notes, contacts, outcomes] = await Promise.all([
            orm.select({ id: schema_1.caseDonor.id, donorProfileId: schema_1.caseDonor.donorProfileId, status: schema_1.caseDonor.status, joinedAt: schema_1.caseDonor.joinedAt })
                .from(schema_1.caseDonor).where((0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseId)).orderBy((0, drizzle_orm_1.asc)(schema_1.caseDonor.createdAt)),
            orm.select({
                id: schema_1.appointment.id, caseDonorId: schema_1.appointment.caseDonorId, facilityId: schema_1.appointment.facilityId, scheduledStart: schema_1.appointment.scheduledStart,
                status: schema_1.appointment.status, previousAppointmentId: schema_1.appointment.previousAppointmentId,
            }).from(schema_1.appointment).where((0, drizzle_orm_1.eq)(schema_1.appointment.caseId, caseId)).orderBy((0, drizzle_orm_1.asc)(schema_1.appointment.createdAt)),
            orm.select({ id: schema_1.caseTask.id, taskType: schema_1.caseTask.taskType, status: schema_1.caseTask.status, dueAt: schema_1.caseTask.dueAt, assigneeUserId: schema_1.caseTask.assigneeUserId })
                .from(schema_1.caseTask).where((0, drizzle_orm_1.eq)(schema_1.caseTask.caseId, caseId)).orderBy((0, drizzle_orm_1.asc)(schema_1.caseTask.createdAt)),
            orm.select({ id: schema_1.caseNote.id, noteType: schema_1.caseNote.noteType, body: schema_1.caseNote.body, authorUserId: schema_1.caseNote.authorUserId, createdAt: schema_1.caseNote.createdAt })
                .from(schema_1.caseNote).where((0, drizzle_orm_1.eq)(schema_1.caseNote.caseId, caseId)).orderBy((0, drizzle_orm_1.asc)(schema_1.caseNote.createdAt)),
            orm.select({
                id: schema_1.contactAttempt.id, targetParty: schema_1.contactAttempt.targetParty, channel: schema_1.contactAttempt.channel, result: schema_1.contactAttempt.result,
                attemptedBy: schema_1.contactAttempt.attemptedBy, attemptedAt: schema_1.contactAttempt.attemptedAt,
            }).from(schema_1.contactAttempt).where((0, drizzle_orm_1.eq)(schema_1.contactAttempt.caseId, caseId)).orderBy((0, drizzle_orm_1.asc)(schema_1.contactAttempt.attemptedAt)),
            orm.select({
                id: schema_1.outcomeUpdate.id, outcomeType: schema_1.outcomeUpdate.outcomeType, sourceType: schema_1.outcomeUpdate.sourceType, confidence: schema_1.outcomeUpdate.confidence,
                units: schema_1.outcomeUpdate.unitsCount, reportedByName: schema_1.outcomeUpdate.reportedByName, reportedByRole: schema_1.outcomeUpdate.reportedByRole,
                channel: schema_1.outcomeUpdate.channel, reportedAt: schema_1.outcomeUpdate.reportedAt, disputed: schema_1.outcomeUpdate.isDisputed, supersedesId: schema_1.outcomeUpdate.supersedesId,
            }).from(schema_1.outcomeUpdate).where((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.caseId, caseId)).orderBy((0, drizzle_orm_1.asc)(schema_1.outcomeUpdate.reportedAt)),
        ]);
        const [labels, facilities, routing] = await Promise.all([
            (0, read_model_public_2.donorLabels)(this.db, donorRows.map((d) => d.donorProfileId)),
            (0, read_model_public_1.facilityNames)(this.db, appointmentRows.map((a) => a.facilityId)),
            (0, read_model_public_3.requestRouting)(this.db, [row.requestId]),
        ]);
        const donors = donorRows.map((d) => ({ id: d.id, donorCode: labels.get(d.donorProfileId)?.donorCode ?? null, status: d.status, joinedAt: d.joinedAt }));
        const appointments = appointmentRows.map((a) => ({ ...a, facility: facilities.get(a.facilityId)?.nameEn ?? null }));
        return {
            id: row.id, caseNo: row.caseNo, requestId: row.requestId, requestReference: routing.get(row.requestId)?.referenceNo ?? null, status: row.status,
            priority: row.priority, ownerUserId: row.ownerUserId, disputed: row.disputed, donors, appointments, tasks, notes, contacts, outcomes,
        };
    }
    async startScheduling(principal, caseId) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            if (row.status === 'Scheduling')
                return { id: row.id, status: row.status };
            if (row.status !== 'Open')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            await this.support.moveCase(tx, row, 'Scheduling', { userId: principal.userId, role: 'SUP' });
            return { id: row.id, status: 'Scheduling' };
        });
    }
    async addNote(principal, caseId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, false);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            return this.insertNote(tx, caseId, principal.userId, (dto.noteType ?? 'GENERAL'), dto.body);
        });
    }
    async logContact(principal, caseId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, false);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            if (dto.caseDonorId) {
                const [own] = await tx.orm.select({ id: schema_1.caseDonor.id }).from(schema_1.caseDonor).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.id, dto.caseDonorId), (0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseId)));
                if (!own)
                    throw new common_1.NotFoundException({ code: 'CASE_DONOR_NOT_FOUND' });
            }
            const [attempt] = await tx.orm
                .insert(schema_1.contactAttempt)
                .values({
                caseId, caseDonorId: dto.caseDonorId ?? null, facilityId: dto.facilityId ?? null, targetParty: dto.party,
                channel: dto.channel, result: dto.result, attemptedBy: principal.userId, attemptedAt: (0, drizzle_orm_1.sql) `now()`,
            })
                .returning({ id: schema_1.contactAttempt.id });
            if (dto.externalPerson)
                await this.insertNote(tx, caseId, principal.userId, 'EXTERNAL_CONTACT', dto.externalPerson);
            return { id: attempt.id };
        });
    }
    async close(principal, caseId, note) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            if (row.status !== 'Resolved')
                throw (0, case_support_1.fail)('CASE_NOT_RESOLVED');
            if (row.disputed)
                throw (0, case_support_1.fail)('CASE_DISPUTED');
            const status = (await (0, request_public_1.requestState)(tx, row.requestId, true)).status;
            await this.support.finishTask(tx, caseId, 'TK_CLOSE_AND_FOLLOW_UP', principal.userId);
            await this.insertNote(tx, caseId, principal.userId, 'GENERAL', note);
            await this.support.moveCase(tx, row, 'Closed', { userId: principal.userId, role: 'SUP' });
            if (status === 'Fulfilled' || status === 'Partially fulfilled')
                await (0, request_public_1.closeRequest)(tx, this.history, row.requestId, status, principal.userId);
            const completed = await tx.orm
                .select({ donorProfileId: schema_1.caseDonor.donorProfileId })
                .from(schema_1.caseDonor)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.caseDonor.status, 'Completed')));
            if (completed.length > 0) {
                await tx.orm.insert(schema_1.postDonationCheckin).values(completed.map((d) => ({ donorProfileId: d.donorProfileId, scheduledFor: (0, drizzle_orm_1.sql) `now() + interval '24 hours'` })));
            }
            await this.support.event(tx, 'COORDINATION_CASE', caseId, 'CaseClosed', { requestId: row.requestId });
            return { id: caseId, status: 'Closed' };
        });
    }
    async advanceAttendance() {
        const rows = await this.db.orm
            .selectDistinct({ id: schema_1.coordinationCase.id })
            .from(schema_1.coordinationCase)
            .innerJoin(schema_1.appointment, (0, drizzle_orm_1.eq)(schema_1.appointment.caseId, schema_1.coordinationCase.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coordinationCase.status, 'Scheduled'), (0, drizzle_orm_1.eq)(schema_1.appointment.status, 'Confirmed'), (0, drizzle_orm_1.lte)(schema_1.appointment.scheduledStart, (0, drizzle_orm_1.sql) `now()`)))
            .limit(100);
        for (const r of rows) {
            await this.db.transaction(async (tx) => {
                const row = await this.support.loadCase(tx, r.id, true);
                if (row.status === 'Scheduled')
                    await this.support.moveCase(tx, row, 'Attendance pending', { userId: null, role: 'SYSTEM' }, 'Appointment time reached');
            });
        }
        return rows.length;
    }
    async flagUnconfirmedDonors() {
        const confirmed = (db, caseDonorId) => db.orm.select({ id: schema_1.appointment.id }).from(schema_1.appointment).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appointment.caseDonorId, caseDonorId), (0, drizzle_orm_1.isNotNull)(schema_1.appointment.confirmedByDonorAt)));
        const rows = await this.db.orm
            .select({ id: schema_1.caseDonor.id, caseId: schema_1.caseDonor.caseId, donorProfileId: schema_1.caseDonor.donorProfileId })
            .from(schema_1.caseDonor)
            .innerJoin(schema_1.coordinationCase, (0, drizzle_orm_1.eq)(schema_1.coordinationCase.id, schema_1.caseDonor.caseId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.status, 'Active'), (0, drizzle_orm_1.inArray)(schema_1.coordinationCase.status, case_status_1.LIVE_CASE_STATUSES), (0, drizzle_orm_1.lte)(schema_1.caseDonor.joinedAt, (0, drizzle_orm_1.sql) `now() - make_interval(mins => CASE WHEN ${schema_1.coordinationCase.priority} = 'Critical' THEN ${CONFIRM_TIMEOUT_MINUTES.Critical}::int ELSE ${CONFIRM_TIMEOUT_MINUTES.High}::int END)`), (0, drizzle_orm_1.notExists)(confirmed(this.db, schema_1.caseDonor.id)), (0, drizzle_orm_1.notExists)(this.db.orm.select({ id: schema_1.caseTask.id }).from(schema_1.caseTask).where((0, drizzle_orm_1.eq)(schema_1.caseTask.dedupeKey, (0, drizzle_orm_1.sql) `'donor-confirm-timeout:' || ${schema_1.caseDonor.id}`)))))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.caseDonor.joinedAt))
            .limit(50);
        for (const r of rows) {
            await this.db.transaction(async (tx) => {
                if ((await confirmed(tx, r.id).limit(1)).length > 0)
                    return;
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
    async reconcileClosedRequests() {
        // Raw SQL: selects cases by request status in another module (ADR-16 rule 6).
        const { rows } = await this.db.query(`SELECT c.id FROM crd.coordination_case c JOIN req.blood_request r ON r.id = c.request_id
        WHERE c.status IN ('Open','Scheduling','Scheduled','Attendance pending','Needs replacement') AND r.status IN ('Cancelled','Unable to fulfil','Rejected') LIMIT 50`);
        for (const r of rows)
            await this.db.transaction((tx) => this.reconcileOne(tx, r.id));
        return rows.length;
    }
    async reconcileOne(tx, caseId) {
        const row = await this.support.loadCase(tx, caseId, true);
        if (row.status === 'Resolved' || row.status === 'Closed')
            return;
        const live = await tx.orm
            .select({ id: schema_1.appointment.id, status: schema_1.appointment.status })
            .from(schema_1.appointment)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appointment.caseId, row.id), (0, drizzle_orm_1.inArray)(schema_1.appointment.status, ['Proposed', 'Confirmed'])));
        for (const a of live) {
            await this.support.moveAppointment(tx, a.id, row.requestId, a.status, 'Cancelled', { userId: null, role: 'SYSTEM' }, { cancelledAt: (0, drizzle_orm_1.sql) `now()`, remindersStopped: true });
        }
        await tx.orm
            .update(schema_1.caseTask)
            .set({ status: 'Cancelled', version: (0, drizzle_orm_1.sql) `${schema_1.caseTask.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseTask.caseId, row.id), (0, drizzle_orm_1.inArray)(schema_1.caseTask.status, ['Open', 'In progress']), (0, drizzle_orm_1.ne)(schema_1.caseTask.taskType, 'TK_CLOSE_AND_FOLLOW_UP')));
        await this.support.moveCase(tx, row, 'Resolved', { userId: null, role: 'SYSTEM' }, 'Request ended');
    }
    async insertNote(tx, caseId, authorUserId, noteType, body) {
        const [note] = await tx.orm.insert(schema_1.caseNote).values({ caseId, authorUserId, noteType, body }).returning({ id: schema_1.caseNote.id });
        return { id: note.id };
    }
};
exports.CaseService = CaseService;
exports.CaseService = CaseService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        case_support_1.CaseSupport,
        status_history_service_1.StatusHistoryService])
], CaseService);
//# sourceMappingURL=case.service.js.map