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
exports.ReviewService = void 0;
exports.widestScope = widestScope;
exports.checklistGaps = checklistGaps;
exports.toReviewView = toReviewView;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const area_scope_1 = require("../../platform/policy/area-scope");
const policy_service_1 = require("../../platform/policy/policy.service");
const policy_types_1 = require("../../platform/policy/policy.types");
const status_history_service_1 = require("../../platform/status/status-history.service");
const identity_public_1 = require("../identity/identity.public");
const request_status_1 = require("./request-status");
const request_changes_1 = require("./request-changes");
const schema_1 = require("./schema");
const pg_core_1 = require("drizzle-orm/pg-core");
const reviewColumns = {
    id: schema_1.bloodRequest.id, referenceNo: schema_1.bloodRequest.referenceNo, patientId: schema_1.bloodRequest.patientId, patientName: schema_1.patient.displayName,
    requestedBloodGroup: schema_1.bloodRequest.requestedBloodGroup, component: schema_1.bloodRequest.component, quantityUnits: schema_1.bloodRequest.quantityUnits, requiredBy: schema_1.bloodRequest.requiredBy,
    urgency: schema_1.bloodRequest.urgency, priority: schema_1.bloodRequest.priority, status: schema_1.bloodRequest.status, areaId: schema_1.bloodRequest.areaId, contactPhone: schema_1.bloodRequest.contactPhone,
    hasModerationHold: schema_1.bloodRequest.hasModerationHold, assignedSupportUserId: schema_1.bloodRequest.assignedSupportUserId, submittedAt: schema_1.bloodRequest.submittedAt,
    firstActionAt: schema_1.bloodRequest.firstActionAt, version: schema_1.bloodRequest.version,
};
const REVIEW_STATUSES = ['Submitted', 'Under review', 'Needs information'];
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
function widestScope(principal, key) {
    const now = Date.now();
    const scopes = principal.grants.filter((g) => g.key === key && (!g.expiresAt || g.expiresAt.getTime() > now)).map((g) => g.scope);
    if (scopes.length === 0)
        return null;
    return scopes.reduce((a, b) => (policy_types_1.SCOPE_ORDER.indexOf(a) >= policy_types_1.SCOPE_ORDER.indexOf(b) ? a : b));
}
function checklistGaps(dto) {
    const labels = {
        documentLegible: 'DOCUMENT_LEGIBLE',
        bloodGroupAndComponentMatch: 'BLOOD_GROUP_AND_COMPONENT_MATCH',
        facilityExists: 'FACILITY_EXISTS',
        representativeReachable: 'REPRESENTATIVE_REACHABLE',
        noDuplicate: 'NO_DUPLICATE',
        urgencyConsistent: 'URGENCY_CONSISTENT',
    };
    return Object.keys(labels).filter((k) => dto[k] !== true).map((k) => labels[k]);
}
let ReviewService = class ReviewService {
    db;
    policy;
    history;
    outbox;
    constructor(db, policy, history, outbox) {
        this.db = db;
        this.policy = policy;
        this.history = history;
        this.outbox = outbox;
    }
    async queue(principal, status) {
        const scope = widestScope(principal, 'blood_request.view');
        if (!scope)
            return [];
        const areas = await (0, area_scope_1.staffAreaIds)(this.db, principal.userId);
        const visible = scope === 'All'
            ? undefined
            : scope === 'Area'
                ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.assignedSupportUserId, principal.userId), areas.length ? (0, drizzle_orm_1.inArray)(schema_1.bloodRequest.areaId, areas) : (0, drizzle_orm_1.sql) `false`)
                : (0, drizzle_orm_1.eq)(schema_1.bloodRequest.assignedSupportUserId, principal.userId);
        const rows = await this.db.orm
            .select(reviewColumns)
            .from(schema_1.bloodRequest)
            .innerJoin(schema_1.patient, (0, drizzle_orm_1.eq)(schema_1.patient.id, schema_1.bloodRequest.patientId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.bloodRequest.status, status ? [status] : REVIEW_STATUSES), (0, drizzle_orm_1.isNull)(schema_1.bloodRequest.deletedAt), visible))
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `(${schema_1.bloodRequest.urgency} = 'Critical')`), (0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `(${schema_1.bloodRequest.urgency} = 'Urgent')`), (0, drizzle_orm_1.asc)(schema_1.bloodRequest.requiredBy))
            .limit(100);
        return rows.map((r) => toReviewView(r));
    }
    async detail(principal, id) {
        const row = await this.load(this.db, id, false);
        await this.requireView(this.db, principal, row);
        return { ...toReviewView(row), flags: await this.flags(id), changes: await this.changes(this.db, id) };
    }
    async changes(db, requestId) {
        return db.orm
            .select({
            id: schema_1.requestChange.id, changeType: schema_1.requestChange.changeType, isMaterial: schema_1.requestChange.isMaterial, status: schema_1.requestChange.status,
            proposedValues: schema_1.requestChange.proposedValues, previousValues: schema_1.requestChange.previousValues, createdAt: schema_1.requestChange.createdAt,
        })
            .from(schema_1.requestChange)
            .where((0, drizzle_orm_1.eq)(schema_1.requestChange.requestId, requestId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.requestChange.createdAt));
    }
    async approveChange(principal, id, changeId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, id, true);
            await this.requireApprove(tx, principal, row);
            const change = await this.lockPendingChange(tx, id, changeId);
            if (!request_changes_1.UPDATABLE_STATUSES.includes(row.status))
                throw fail('UPDATE_NOT_ALLOWED');
            const values = { ...change.proposedValues };
            if (typeof values.requiredBy === 'string') {
                const requiredBy = new Date(values.requiredBy);
                if (requiredBy.getTime() <= Date.now())
                    throw fail('REQUIRED_BY_IN_PAST');
                values.requiredBy = requiredBy;
            }
            await tx.orm
                .update(schema_1.bloodRequest)
                .set({ ...values, version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await this.decide(tx, principal, row, change.id, 'Approved', change.changeType, dto.note);
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestChangeApproved',
                payload: { changeId: change.id, changeType: change.changeType, requestStatus: row.status },
                version: row.version + 1,
            });
            return { ...toReviewView(await this.load(tx, id, false)), flags: await this.flags(id), changes: await this.changes(tx, id) };
        });
    }
    async rejectChange(principal, id, changeId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, id, true);
            await this.requireApprove(tx, principal, row);
            const change = await this.lockPendingChange(tx, id, changeId);
            await this.decide(tx, principal, row, change.id, 'Rejected', change.changeType, dto.reason);
            await tx.orm.update(schema_1.bloodRequest).set({ version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestChangeRejected', payload: { changeId: change.id, changeType: change.changeType },
                version: row.version + 1,
            });
            return { ...toReviewView(await this.load(tx, id, false)), flags: await this.flags(id), changes: await this.changes(tx, id) };
        });
    }
    async lockPendingChange(tx, requestId, changeId) {
        const [change] = await tx.orm
            .select({ id: schema_1.requestChange.id, status: schema_1.requestChange.status, changeType: schema_1.requestChange.changeType, proposedValues: schema_1.requestChange.proposedValues })
            .from(schema_1.requestChange)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requestChange.id, changeId), (0, drizzle_orm_1.eq)(schema_1.requestChange.requestId, requestId)))
            .for('update');
        if (!change)
            throw new common_1.NotFoundException({ code: 'CHANGE_NOT_FOUND' });
        if (change.status !== 'Pending')
            throw fail('CHANGE_NOT_PENDING', common_1.HttpStatus.CONFLICT);
        return change;
    }
    async decide(tx, principal, row, changeId, to, changeType, reason) {
        await tx.orm
            .update(schema_1.requestChange)
            .set({ status: to, decidedBy: principal.userId, version: (0, drizzle_orm_1.sql) `${schema_1.requestChange.version} + 1`, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.requestChange.id, changeId));
        await this.history.record(tx, {
            entityType: 'REQUEST_CHANGE', entityId: changeId, from: 'Pending', to, actorUserId: principal.userId,
            actorRole: principal.role === 'MOD' ? 'MOD' : 'SUP', source: 'USER', contextRequestId: row.id, reasonCode: changeType, reason,
            correlationId: (0, node_crypto_1.randomUUID)(),
        });
    }
    async flags(requestId) {
        const matched = (0, pg_core_1.alias)(schema_1.bloodRequest, 'm');
        return this.db.orm
            .select({
            id: schema_1.requestFlag.id, flagType: schema_1.requestFlag.flagType, matchedRequestId: schema_1.requestFlag.matchedRequestId, matchedReferenceNo: matched.referenceNo, detail: schema_1.requestFlag.detail,
            status: schema_1.requestFlag.status, createdAt: schema_1.requestFlag.createdAt, resolvedAt: schema_1.requestFlag.resolvedAt, resolutionNote: schema_1.requestFlag.resolutionNote,
        })
            .from(schema_1.requestFlag)
            .leftJoin(matched, (0, drizzle_orm_1.eq)(matched.id, schema_1.requestFlag.matchedRequestId))
            .where((0, drizzle_orm_1.eq)(schema_1.requestFlag.requestId, requestId))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.requestFlag.createdAt));
    }
    async resolveFlag(principal, requestId, flagId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, requestId, true);
            await this.requireApprove(tx, principal, row);
            const res = await tx.orm
                .update(schema_1.requestFlag)
                .set({ status: dto.resolution, resolvedBy: principal.userId, resolvedAt: new Date(), resolutionNote: dto.note })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requestFlag.id, flagId), (0, drizzle_orm_1.eq)(schema_1.requestFlag.requestId, requestId), (0, drizzle_orm_1.eq)(schema_1.requestFlag.status, 'Open')));
            if (!res.rowCount)
                throw new common_1.NotFoundException({ code: 'FLAG_NOT_FOUND' });
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: requestId, eventType: 'RequestFlagResolved', payload: { flagId, resolution: dto.resolution },
            });
            return { flagId, status: dto.resolution };
        });
    }
    async pickUp(principal, id) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, id, true);
            await this.requireView(tx, principal, row);
            if (row.assignedSupportUserId === principal.userId && row.status === 'Under review')
                return toReviewView(row);
            if (row.assignedSupportUserId && row.assignedSupportUserId !== principal.userId)
                throw fail('ALREADY_PICKED_UP', common_1.HttpStatus.CONFLICT);
            this.transition(row, 'pick_up', principal);
            await tx.orm
                .update(schema_1.bloodRequest)
                .set({
                status: 'Under review', assignedSupportUserId: principal.userId, firstActionAt: (0, drizzle_orm_1.sql) `coalesce(${schema_1.bloodRequest.firstActionAt}, now())`,
                version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await tx.query(`INSERT INTO crd.case_task (request_id, task_type, status, assignee_user_id, dedupe_key)
         VALUES ($1, 'TK_VERIFY_REQUEST', 'In progress', $2, $3) ON CONFLICT DO NOTHING`, [id, principal.userId, `verify:${id}`]);
            await this.after(tx, principal, row, 'Under review', 'RequestPickedUp');
            return toReviewView(await this.load(tx, id, false));
        });
    }
    async requestInformation(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, id, true);
            await this.requireApprove(tx, principal, row);
            this.transition(row, 'request_information', principal);
            await tx.orm.update(schema_1.bloodRequest).set({ status: 'Needs information', version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await this.after(tx, principal, row, 'Needs information', 'RequestInformationRequested', {
                reasonCode: 'MISSING_INFORMATION', reason: dto.message, details: { missingItems: dto.items },
            });
            return toReviewView(await this.load(tx, id, false));
        });
    }
    async verify(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, id, true);
            await this.requireApprove(tx, principal, row);
            this.transition(row, 'verify', principal);
            if (row.hasModerationHold)
                throw fail('MODERATION_REVIEW_IN_PROGRESS');
            const [open] = await tx.orm.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.requestFlag).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requestFlag.requestId, id), (0, drizzle_orm_1.eq)(schema_1.requestFlag.status, 'Open')));
            if (open.n > 0)
                throw fail('UNRESOLVED_FLAGS');
            const gaps = checklistGaps(dto);
            if (gaps.length > 0)
                throw new common_1.HttpException({ code: 'CHECKLIST_INCOMPLETE', missing: gaps }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            await tx.orm
                .update(schema_1.bloodRequest)
                .set({ status: 'Verified', verifiedAt: new Date(), version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await this.completeTask(tx, id, principal.userId);
            await this.after(tx, principal, row, 'Verified', 'RequestVerified', { details: { checklist: dto } });
            return toReviewView(await this.load(tx, id, false));
        });
    }
    async reject(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, id, true);
            if (principal.role === 'MOD')
                await this.requireModerationReject(principal, row);
            else
                await this.requireApprove(tx, principal, row);
            this.transition(row, 'reject', principal);
            await tx.orm.update(schema_1.bloodRequest).set({ status: 'Rejected', version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await this.completeTask(tx, id, principal.userId);
            await this.after(tx, principal, row, 'Rejected', 'RequestRejected', { reasonCode: dto.reasonCode, reason: dto.explanation });
            return toReviewView(await this.load(tx, id, false));
        });
    }
    transition(row, command, principal) {
        const t = (0, request_status_1.findTransition)(row.status, command);
        const actor = principal.role === 'SUP' || principal.role === 'MOD' ? principal.role : null;
        if (!t || !actor || !(0, request_status_1.canActorRun)(t, actor, row.status))
            throw fail('INVALID_TRANSITION');
    }
    async after(tx, principal, row, to, event, extra = {}) {
        await this.history.record(tx, {
            entityType: 'BLOOD_REQUEST', entityId: row.id, from: row.status, to, actorUserId: principal.userId,
            actorRole: principal.role === 'MOD' ? 'MOD' : 'SUP', source: 'USER', contextRequestId: row.id,
            reasonCode: extra.reasonCode, reason: extra.reason, details: extra.details, correlationId: (0, node_crypto_1.randomUUID)(),
        }, request_status_1.requestStateMachine);
        await this.outbox.append(tx, {
            aggregateType: 'BLOOD_REQUEST', aggregateId: row.id, eventType: event,
            payload: { from: row.status, to, ...(extra.reasonCode ? { reasonCode: extra.reasonCode } : {}), ...(extra.details ?? {}) },
            version: row.version + 1,
        });
    }
    completeTask(tx, requestId, userId) {
        return tx.query(`UPDATE crd.case_task SET status = 'Done', completed_by = $2, completed_at = now(), version = version + 1, updated_at = now()
        WHERE request_id = $1 AND task_type = 'TK_VERIFY_REQUEST' AND status <> 'Done'`, [requestId, userId]);
    }
    async requireView(db, principal, row) {
        const decision = this.policy.decide(principal, 'blood_request.view', {
            resource: { assignedUserIds: row.assignedSupportUserId ? [row.assignedSupportUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
            principalAreaIds: await (0, area_scope_1.staffAreaIds)(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    }
    async requireApprove(db, principal, row) {
        await this.requireView(db, principal, row);
        const decision = this.policy.decide(principal, 'blood_request.approve', {
            resource: { assignedUserIds: row.assignedSupportUserId ? [row.assignedSupportUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
            principalAreaIds: await (0, area_scope_1.staffAreaIds)(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
    }
    async requireModerationReject(principal, row) {
        if (!widestScope(principal, 'blood_request.reject_moderation'))
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
        if (!row.hasModerationHold)
            throw fail('NO_MODERATION_HOLD');
    }
    async load(db, id, lock) {
        const query = db.orm.select(reviewColumns).from(schema_1.bloodRequest).innerJoin(schema_1.patient, (0, drizzle_orm_1.eq)(schema_1.patient.id, schema_1.bloodRequest.patientId)).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id), (0, drizzle_orm_1.isNull)(schema_1.bloodRequest.deletedAt)));
        const [row] = lock ? await query.for('update') : await query;
        if (!row)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        return row;
    }
};
exports.ReviewService = ReviewService;
exports.ReviewService = ReviewService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        policy_service_1.PolicyService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService])
], ReviewService);
function toReviewView(r) {
    return {
        id: r.id,
        referenceNo: r.referenceNo,
        patientName: r.patientName,
        requestedBloodGroup: r.requestedBloodGroup,
        component: r.component,
        quantityUnits: r.quantityUnits,
        requiredBy: r.requiredBy,
        urgency: r.urgency,
        priority: r.priority,
        status: r.status,
        areaId: r.areaId,
        contactPhone: r.contactPhone ? (0, identity_public_1.maskPhone)(r.contactPhone) : null,
        hasModerationHold: r.hasModerationHold,
        assignedSupportUserId: r.assignedSupportUserId,
        submittedAt: r.submittedAt,
        firstActionAt: r.firstActionAt,
        version: r.version,
    };
}
//# sourceMappingURL=review.service.js.map