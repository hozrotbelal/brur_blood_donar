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
exports.OutcomeService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const database_service_1 = require("../../platform/db/database.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const matching_public_1 = require("../matching/matching.public");
const request_public_1 = require("../request/request.public");
const case_service_1 = require("./case.service");
const case_support_1 = require("./case.support");
const schema_1 = require("./schema");
const COUNTS_TOWARDS_FULFILMENT = ['DONATION_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE'];
const SERVICE_SOURCES = ['COLLECTION_SERVICE_CONFIRMATION', 'HOSPITAL_CONFIRMATION'];
const superseding = (0, pg_core_1.alias)(schema_1.outcomeUpdate, 'superseding');
const notSuperseded = (db) => (0, drizzle_orm_1.notExists)(db.orm.select({ id: superseding.id }).from(superseding).where((0, drizzle_orm_1.eq)(superseding.supersedesId, schema_1.outcomeUpdate.id)));
let OutcomeService = class OutcomeService {
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
    async record(principal, caseId, dto) {
        if (dto.channel === 'PHONE' && !dto.reportedByName?.trim())
            throw (0, case_support_1.fail)('REPORTER_NAME_REQUIRED');
        if (COUNTS_TOWARDS_FULFILMENT.includes(dto.outcomeType) && dto.units === undefined)
            throw (0, case_support_1.fail)('UNITS_REQUIRED');
        const reportedAt = dto.reportedAt ? new Date(dto.reportedAt) : new Date();
        if (reportedAt.getTime() > Date.now() + 60_000)
            throw (0, case_support_1.fail)('REPORTED_IN_FUTURE');
        const confidence = SERVICE_SOURCES.includes(dto.sourceType) ? 'Service-confirmed' : 'Self-reported';
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'outcome.report');
            if (row.status !== 'Attendance pending' && row.status !== 'Outcome pending')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            let donorProfileId = null;
            if (dto.caseDonorId) {
                const [own] = await tx.orm
                    .select({ donorProfileId: schema_1.caseDonor.donorProfileId })
                    .from(schema_1.caseDonor)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.id, dto.caseDonorId), (0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseId)));
                if (!own)
                    throw (0, case_support_1.fail)('CASE_DONOR_NOT_FOUND', 404);
                donorProfileId = own.donorProfileId;
            }
            const [inserted] = await tx.orm
                .insert(schema_1.outcomeUpdate)
                .values({
                caseId, requestId: row.requestId, caseDonorId: dto.caseDonorId ?? null, outcomeType: dto.outcomeType,
                sourceType: dto.sourceType, confidence, reportedByName: dto.reportedByName ?? null, reportedByRole: dto.reportedByRole ?? null,
                channel: dto.channel, reportedAt, recordedBy: principal.userId, unitsCount: dto.units ?? null, reasonText: dto.reason ?? null,
            })
                .returning({ id: schema_1.outcomeUpdate.id });
            let current = row;
            if (current.status === 'Attendance pending')
                current = await this.support.moveCase(tx, current, 'Outcome pending', { userId: principal.userId, role: 'SUP' }, 'Outcome recorded');
            if (COUNTS_TOWARDS_FULFILMENT.includes(dto.outcomeType)) {
                await (0, request_public_1.markDonationReported)(tx, this.history, row.requestId, { userId: principal.userId, role: 'SUP' }, 'OUTCOME_RECORDED');
            }
            if (dto.outcomeType === 'DONATION_NOT_COMPLETED' && dto.caseDonorId) {
                await this.cases.handleDonorLeft(tx, { caseDonorId: dto.caseDonorId, kind: 'NOT_COMPLETED', actorUserId: principal.userId, actorRole: 'SUP' });
            }
            await this.support.event(tx, 'COORDINATION_CASE', caseId, 'OutcomeRecorded', {
                outcomeId: inserted.id,
                caseId,
                requestId: row.requestId,
                caseDonorId: dto.caseDonorId ?? null,
                donorProfileId,
                outcomeType: dto.outcomeType,
                sourceType: dto.sourceType,
                confidence,
                reportedAt: reportedAt.toISOString(),
                units: dto.units ?? null,
            }, Date.now());
            return { id: inserted.id, confidence, caseStatus: current.status };
        });
    }
    async setFulfilment(principal, caseId) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            const req = (await (0, request_public_1.requestState)(tx, row.requestId, true));
            if (req.status !== 'Awaiting outcome' || row.status !== 'Outcome pending')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            if (row.disputed)
                throw (0, case_support_1.fail)('CASE_DISPUTED');
            const [units] = await tx.orm
                .select({ n: (0, drizzle_orm_1.sql) `COALESCE(sum(${schema_1.outcomeUpdate.unitsCount}), 0)::int` })
                .from(schema_1.outcomeUpdate)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.confidence, 'Service-confirmed'), (0, drizzle_orm_1.inArray)(schema_1.outcomeUpdate.outcomeType, COUNTS_TOWARDS_FULFILMENT), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.isDisputed, false), notSuperseded(tx)));
            const confirmed = Math.min(units.n, req.quantityUnits);
            if (confirmed === 0)
                throw (0, case_support_1.fail)('FULFILMENT_NEEDS_SERVICE_CONFIRMATION');
            const full = confirmed >= req.quantityUnits;
            const to = await (0, request_public_1.recordFulfilment)(tx, this.history, row.requestId, confirmed, req.quantityUnits, principal.userId);
            const completed = tx.orm
                .select({ id: schema_1.outcomeUpdate.caseDonorId })
                .from(schema_1.outcomeUpdate)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.outcomeType, 'DONATION_COMPLETED'), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.confidence, 'Service-confirmed')));
            await tx.orm
                .update(schema_1.caseDonor)
                .set({ status: 'Completed', version: (0, drizzle_orm_1.sql) `${schema_1.caseDonor.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseDonor.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.caseDonor.status, 'Active'), (0, drizzle_orm_1.inArray)(schema_1.caseDonor.id, completed)));
            await this.support.finishTask(tx, caseId, 'TK_OBTAIN_SOURCED_OUTCOME', principal.userId);
            if (full)
                await this.support.moveCase(tx, row, 'Resolved', { userId: principal.userId, role: 'SUP' }, 'Fulfilled');
            else
                await this.support.openTask(tx, row, 'TK_CONFIRM_MORE_DONORS_NEEDED', `more:${caseId}`, 120);
            await this.support.event(tx, 'BLOOD_REQUEST', row.requestId, full ? 'RequestFulfilled' : 'RequestPartiallyFulfilled', { confirmedUnits: confirmed }, Date.now());
            return { requestStatus: to, confirmedUnits: confirmed, requestedUnits: req.quantityUnits };
        });
    }
    async dispute(principal, caseId, outcomeId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            const [found] = await tx.orm
                .select({ isDisputed: schema_1.outcomeUpdate.isDisputed })
                .from(schema_1.outcomeUpdate)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.id, outcomeId), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.caseId, caseId), notSuperseded(tx)))
                .for('update');
            if (!found)
                throw (0, case_support_1.fail)('OUTCOME_NOT_FOUND', 404);
            if (found.isDisputed)
                throw (0, case_support_1.fail)('ALREADY_DISPUTED', 409);
            await tx.orm.update(schema_1.outcomeUpdate).set({ isDisputed: true }).where((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.id, outcomeId));
            await this.setCaseDisputed(tx, caseId, true);
            await this.cases.insertNote(tx, caseId, principal.userId, 'ESCALATION', dto.reason);
            await tx.orm
                .insert(schema_1.escalation)
                .values({
                subjectType: 'COORDINATION_CASE', subjectId: caseId, requestId: row.requestId, caseId, level: 1, reason: 'DISPUTED', status: 'Open',
                escalatedToUserId: row.ownerUserId, dedupeKey: `dispute:${outcomeId}`,
            })
                .onConflictDoNothing({ target: schema_1.escalation.dedupeKey });
            await this.support.event(tx, 'COORDINATION_CASE', caseId, 'OutcomeDisputed', { outcomeId, caseId, requestId: row.requestId }, Date.now());
            return { caseId, outcomeId, disputed: true };
        });
    }
    async resolveDispute(principal, caseId, outcomeId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            const [original] = await tx.orm
                .select({ caseDonorId: schema_1.outcomeUpdate.caseDonorId, unitsCount: schema_1.outcomeUpdate.unitsCount })
                .from(schema_1.outcomeUpdate)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.id, outcomeId), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.isDisputed, true), notSuperseded(tx)))
                .for('update');
            if (!original)
                throw (0, case_support_1.fail)('NO_OPEN_DISPUTE', 404);
            let correctionId = null;
            if (dto.resolution === 'UPHELD') {
                await tx.orm.update(schema_1.outcomeUpdate).set({ isDisputed: false }).where((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.id, outcomeId));
            }
            else {
                const c = dto.correction;
                if (!c)
                    throw (0, case_support_1.fail)('CORRECTION_REQUIRED');
                if (COUNTS_TOWARDS_FULFILMENT.includes(c.outcomeType) && c.units === undefined)
                    throw (0, case_support_1.fail)('UNITS_REQUIRED');
                if (c.channel === 'PHONE' && !c.reportedByName?.trim())
                    throw (0, case_support_1.fail)('REPORTER_NAME_REQUIRED');
                const confidence = SERVICE_SOURCES.includes(c.sourceType) ? 'Service-confirmed' : 'Self-reported';
                const [inserted] = await tx.orm
                    .insert(schema_1.outcomeUpdate)
                    .values({
                    caseId, requestId: row.requestId, caseDonorId: original.caseDonorId, outcomeType: c.outcomeType,
                    sourceType: c.sourceType, confidence, reportedByName: c.reportedByName ?? null, reportedByRole: c.reportedByRole ?? null,
                    channel: c.channel, reportedAt: (0, drizzle_orm_1.sql) `now()`, recordedBy: principal.userId, unitsCount: c.units ?? null,
                    reasonText: c.reason ?? null, supersedesId: outcomeId,
                })
                    .returning({ id: schema_1.outcomeUpdate.id });
                correctionId = inserted.id;
            }
            const [remaining] = await tx.orm
                .select({ n: (0, drizzle_orm_1.count)() })
                .from(schema_1.outcomeUpdate)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.outcomeUpdate.isDisputed, true), notSuperseded(tx)));
            const stillDisputed = remaining.n > 0;
            await this.setCaseDisputed(tx, caseId, stillDisputed);
            await tx.orm
                .update(schema_1.escalation)
                .set({ status: 'Resolved', version: (0, drizzle_orm_1.sql) `${schema_1.escalation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.escalation.dedupeKey, `dispute:${outcomeId}`), (0, drizzle_orm_1.inArray)(schema_1.escalation.status, ['Open', 'Acknowledged'])));
            await this.cases.insertNote(tx, caseId, principal.userId, 'GENERAL', dto.note);
            await this.support.event(tx, 'COORDINATION_CASE', caseId, 'OutcomeDisputeResolved', { outcomeId, caseId, requestId: row.requestId, resolution: dto.resolution, correctionId }, Date.now());
            return { caseId, outcomeId, resolution: dto.resolution, correctionId, disputed: stillDisputed };
        });
    }
    async moreDonors(principal, caseId, needed) {
        return this.db.transaction(async (tx) => {
            const row = await this.support.loadCase(tx, caseId, true);
            await this.support.requireAccess(tx, principal, row, 'case.edit');
            const request = await (0, request_public_1.requestState)(tx, row.requestId, true);
            if (request?.status !== 'Partially fulfilled' || row.status !== 'Outcome pending')
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            await this.support.finishTask(tx, caseId, 'TK_CONFIRM_MORE_DONORS_NEEDED', principal.userId);
            if (needed) {
                await (0, request_public_1.returnToSearching)(tx, this.history, row.requestId, 'Partially fulfilled', { userId: principal.userId, role: 'SUP' }, 'MORE_DONORS_NEEDED');
                await this.support.moveCase(tx, row, 'Open', { userId: principal.userId, role: 'SUP' }, 'More donors needed');
                await this.support.openTask(tx, row, 'TK_OBTAIN_SOURCED_OUTCOME', `outcome-more:${caseId}:${Date.now()}`, 1440);
                return { requestStatus: 'Searching' };
            }
            await this.support.moveCase(tx, row, 'Resolved', { userId: principal.userId, role: 'SUP' }, 'No more donors needed');
            return { requestStatus: 'Partially fulfilled' };
        });
    }
    async declareUnable(principal, requestId, reason) {
        return this.db.transaction(async (tx) => {
            const [found] = await tx.orm.select({ id: schema_1.coordinationCase.id }).from(schema_1.coordinationCase).where((0, drizzle_orm_1.eq)(schema_1.coordinationCase.requestId, requestId));
            const req = await (0, request_public_1.requestState)(tx, requestId, true);
            if (!req)
                throw (0, case_support_1.fail)('REQUEST_NOT_FOUND', 404);
            const caseRow = found ? await this.support.loadCase(tx, found.id, true) : null;
            if (caseRow)
                await this.support.requireAccess(tx, principal, caseRow, 'case.edit');
            else if (req.assignedSupportUserId !== principal.userId)
                throw (0, case_support_1.fail)('REQUEST_NOT_FOUND', 404);
            if (!(0, request_public_1.findTransition)(req.status, 'declare_unable'))
                throw (0, case_support_1.fail)('INVALID_TRANSITION');
            await (0, request_public_1.declareRequestUnable)(tx, this.history, requestId, req.status, reason, principal.userId);
            await (0, matching_public_1.cancelOpenInvitations)(tx, requestId);
            if (caseRow)
                await this.cases.reconcileOne(tx, caseRow.id);
            await this.support.event(tx, 'BLOOD_REQUEST', requestId, 'RequestUnableToFulfil', { reason });
            return { requestStatus: 'Unable to fulfil' };
        });
    }
    async setCaseDisputed(tx, caseId, disputed) {
        await tx.orm
            .update(schema_1.coordinationCase)
            .set({ disputed, version: (0, drizzle_orm_1.sql) `${schema_1.coordinationCase.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.eq)(schema_1.coordinationCase.id, caseId));
    }
};
exports.OutcomeService = OutcomeService;
exports.OutcomeService = OutcomeService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        case_support_1.CaseSupport,
        case_service_1.CaseService,
        status_history_service_1.StatusHistoryService])
], OutcomeService);
//# sourceMappingURL=outcome.service.js.map