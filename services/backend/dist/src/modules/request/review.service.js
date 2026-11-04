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
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const policy_service_1 = require("../../platform/policy/policy.service");
const policy_types_1 = require("../../platform/policy/policy.types");
const status_history_service_1 = require("../../platform/status/status-history.service");
const identity_public_1 = require("../identity/identity.public");
const request_status_1 = require("./request-status");
const COLUMNS = `r.id, r.reference_no, r.patient_id, p.display_name AS patient_name, r.requested_blood_group, r.component, r.quantity_units,
  r.required_by, r.urgency, r.priority, r.status, r.area_id, r.contact_phone, r.has_moderation_hold, r.assigned_support_user_id,
  r.submitted_at, r.first_action_at, r.version`;
const FROM = 'req.blood_request r JOIN req.patient p ON p.id = r.patient_id';
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
        const areas = await this.areaIds(this.db, principal.userId);
        const scope = widestScope(principal, 'blood_request.view');
        const visible = scope === 'All' ? 'true' : scope === 'Area' ? '(r.assigned_support_user_id = $1 OR r.area_id = ANY($2::uuid[]))' : '(r.assigned_support_user_id = $1)';
        const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM ${FROM}
        WHERE r.status = ANY($3::request_status[]) AND r.deleted_at IS NULL AND ${scope ? visible : 'false'}
        ORDER BY (r.urgency = 'Critical') DESC, (r.urgency = 'Urgent') DESC, r.required_by LIMIT 100`, [principal.userId, areas, status ? [status] : REVIEW_STATUSES]);
        return rows.map(toReviewView);
    }
    async detail(principal, id) {
        const row = await this.load(this.db, id, false);
        await this.requireView(this.db, principal, row);
        return { ...toReviewView(row), flags: await this.flags(id) };
    }
    async flags(requestId) {
        const { rows } = await this.db.query(`SELECT f.id, f.flag_type AS "flagType", f.matched_request_id AS "matchedRequestId", m.reference_no AS "matchedReferenceNo", f.detail,
              f.status, f.created_at AS "createdAt", f.resolved_at AS "resolvedAt", f.resolution_note AS "resolutionNote"
         FROM req.request_flag f LEFT JOIN req.blood_request m ON m.id = f.matched_request_id WHERE f.request_id = $1 ORDER BY f.created_at`, [requestId]);
        return rows;
    }
    async resolveFlag(principal, requestId, flagId, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.load(tx, requestId, true);
            await this.requireApprove(tx, principal, row);
            const res = await tx.query(`UPDATE req.request_flag SET status = $3, resolved_by = $4, resolved_at = now(), resolution_note = $5
          WHERE id = $1 AND request_id = $2 AND status = 'Open'`, [flagId, requestId, dto.resolution, principal.userId, dto.note]);
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
            if (row.assigned_support_user_id === principal.userId && row.status === 'Under review')
                return toReviewView(row);
            if (row.assigned_support_user_id && row.assigned_support_user_id !== principal.userId)
                throw fail('ALREADY_PICKED_UP', common_1.HttpStatus.CONFLICT);
            this.transition(row, 'pick_up', principal);
            await tx.query(`UPDATE req.blood_request SET status = 'Under review', assigned_support_user_id = $2, first_action_at = COALESCE(first_action_at, now()),
                version = version + 1, updated_at = now() WHERE id = $1`, [id, principal.userId]);
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
            await tx.query(`UPDATE req.blood_request SET status = 'Needs information', version = version + 1, updated_at = now() WHERE id = $1`, [id]);
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
            if (row.has_moderation_hold)
                throw fail('MODERATION_REVIEW_IN_PROGRESS');
            const open = await tx.query(`SELECT count(*)::int AS n FROM req.request_flag WHERE request_id = $1 AND status = 'Open'`, [id]);
            if (open.rows[0].n > 0)
                throw fail('UNRESOLVED_FLAGS');
            const gaps = checklistGaps(dto);
            if (gaps.length > 0)
                throw new common_1.HttpException({ code: 'CHECKLIST_INCOMPLETE', missing: gaps }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            await tx.query(`UPDATE req.blood_request SET status = 'Verified', verified_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [id]);
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
            await tx.query(`UPDATE req.blood_request SET status = 'Rejected', version = version + 1, updated_at = now() WHERE id = $1`, [id]);
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
            resource: { assignedUserIds: row.assigned_support_user_id ? [row.assigned_support_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
            principalAreaIds: await this.areaIds(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    }
    async requireApprove(db, principal, row) {
        await this.requireView(db, principal, row);
        const decision = this.policy.decide(principal, 'blood_request.approve', {
            resource: { assignedUserIds: row.assigned_support_user_id ? [row.assigned_support_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
            principalAreaIds: await this.areaIds(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
    }
    async requireModerationReject(principal, row) {
        if (!widestScope(principal, 'blood_request.reject_moderation'))
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
        if (!row.has_moderation_hold)
            throw fail('NO_MODERATION_HOLD');
    }
    async load(db, id, lock) {
        const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1 AND r.deleted_at IS NULL ${lock ? 'FOR UPDATE OF r' : ''}`, [id]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        return rows[0];
    }
    async areaIds(db, userId) {
        const { rows } = await db.query(`SELECT s.area_id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id
        WHERE ur.user_id = $1 AND ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id IS NOT NULL`, [userId]);
        return rows.map((r) => r.area_id);
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
        referenceNo: r.reference_no,
        patientName: r.patient_name,
        requestedBloodGroup: r.requested_blood_group,
        component: r.component,
        quantityUnits: r.quantity_units,
        requiredBy: r.required_by,
        urgency: r.urgency,
        priority: r.priority,
        status: r.status,
        areaId: r.area_id,
        contactPhone: r.contact_phone ? (0, identity_public_1.maskPhone)(r.contact_phone) : null,
        hasModerationHold: r.has_moderation_hold,
        assignedSupportUserId: r.assigned_support_user_id,
        submittedAt: r.submitted_at,
        firstActionAt: r.first_action_at,
        version: r.version,
    };
}
//# sourceMappingURL=review.service.js.map