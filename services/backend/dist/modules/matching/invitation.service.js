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
exports.InvitationService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const case_workflow_public_1 = require("../case-workflow/case-workflow.public");
const identity_public_1 = require("../identity/identity.public");
const read_model_public_1 = require("../identity/read-model.public");
const request_public_1 = require("../request/request.public");
const matching_rules_1 = require("./matching.rules");
const schema_1 = require("./schema");
const COLUMNS = {
    id: schema_1.invitation.id, requestId: schema_1.invitation.requestId, status: schema_1.invitation.status, response: schema_1.invitation.response, expiresAt: schema_1.invitation.expiresAt,
    sentAt: schema_1.invitation.sentAt, viewedAt: schema_1.invitation.viewedAt, respondedAt: schema_1.invitation.respondedAt, payloadSnapshot: schema_1.invitation.payloadSnapshot,
    donorProfileId: schema_1.invitation.donorProfileId,
};
const OPEN = ['Sent', 'Delivered', 'Viewed'];
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
let InvitationService = class InvitationService {
    db;
    history;
    outbox;
    cases;
    constructor(db, history, outbox, cases) {
        this.db = db;
        this.history = history;
        this.outbox = outbox;
        this.cases = cases;
    }
    async list(principal) {
        const donorProfileId = await (0, read_model_public_1.donorProfileIdOf)(this.db, principal.userId);
        if (!donorProfileId)
            return [];
        const rows = await this.db.orm
            .select(COLUMNS)
            .from(schema_1.invitation)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invitation.donorProfileId, donorProfileId), (0, drizzle_orm_1.inArray)(schema_1.invitation.status, ['Sent', 'Delivered', 'Viewed', 'Responded', 'Expired']), (0, drizzle_orm_1.gt)(schema_1.invitation.sentAt, (0, drizzle_orm_1.sql) `now() - interval '30 days'`)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.invitation.sentAt))
            .limit(50);
        return rows.map(view);
    }
    async open(principal, id) {
        return this.db.transaction(async (tx) => {
            const row = await this.lock(tx, principal, id);
            if (OPEN.slice(0, 2).includes(row.status) && row.expiresAt.getTime() > Date.now()) {
                await tx.orm
                    .update(schema_1.invitation)
                    .set({ status: 'Viewed', viewedAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                    .where((0, drizzle_orm_1.eq)(schema_1.invitation.id, id));
                return view({ ...row, status: 'Viewed', viewedAt: new Date() });
            }
            return view(row);
        });
    }
    async respond(principal, id, dto) {
        if (dto.response === 'Later' && !dto.laterAvailableAt)
            throw fail('LATER_TIME_REQUIRED');
        const later = dto.laterAvailableAt ? new Date(dto.laterAvailableAt) : null;
        if (later && later.getTime() <= Date.now())
            throw fail('LATER_TIME_IN_PAST');
        return this.db.transaction(async (tx) => {
            const row = await this.lock(tx, principal, id);
            if (dto.clientMutationId) {
                const [seen] = await tx.orm
                    .select({ id: schema_1.invitationResponse.id })
                    .from(schema_1.invitationResponse)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invitationResponse.invitationId, id), (0, drizzle_orm_1.eq)(schema_1.invitationResponse.clientMutationId, dto.clientMutationId)));
                if (seen)
                    return view(row);
            }
            if (!OPEN.includes(row.status) || row.expiresAt.getTime() <= Date.now())
                throw fail('INVITATION_CLOSED', common_1.HttpStatus.GONE);
            await tx.orm.insert(schema_1.invitationResponse).values({
                invitationId: id, responseValue: dto.response, laterAvailableAt: later, channel: 'IN_APP', clientMutationId: dto.clientMutationId ?? null,
            });
            await tx.orm
                .update(schema_1.invitation)
                .set({ status: 'Responded', response: dto.response, respondedAt: (0, drizzle_orm_1.sql) `now()`, laterRecheckAt: later, version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.eq)(schema_1.invitation.id, id));
            await (0, identity_public_1.touchDonorResponse)(tx, row.donorProfileId);
            if (dto.response === 'Available') {
                await (0, request_public_1.markFirstWilling)(tx, this.history, row.requestId);
                await this.cases.linkAvailableDonor(tx, { requestId: row.requestId, invitationId: id, donorProfileId: row.donorProfileId });
            }
            await this.outbox.append(tx, {
                aggregateType: 'INVITATION', aggregateId: id, eventType: 'InvitationResponded', payload: { response: dto.response, requestId: row.requestId },
            });
            return view({ ...row, status: 'Responded', response: dto.response, respondedAt: new Date() });
        });
    }
    async withdraw(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.lock(tx, principal, id);
            if (row.status === 'Withdrawn')
                return view(row);
            if (row.status !== 'Responded' || row.response !== 'Available')
                throw fail('INVALID_TRANSITION');
            await tx.orm.insert(schema_1.invitationResponse).values({ invitationId: id, responseValue: null, isWithdrawal: true, withdrawalReason: dto.reason, channel: 'IN_APP' });
            await tx.orm
                .update(schema_1.invitation)
                .set({ status: 'Withdrawn', withdrawnAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.eq)(schema_1.invitation.id, id));
            await this.cases.handleDonorLeft(tx, { invitationId: id, kind: 'WITHDRAWN', actorUserId: principal.userId, actorRole: 'DON' });
            await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: id, eventType: 'InvitationWithdrawn', payload: { requestId: row.requestId } });
            return view({ ...row, status: 'Withdrawn' });
        });
    }
    async cancelForEndedRequests(limit = 200) {
        // Raw SQL: selects by request status in another module (ADR-16 rule 6).
        const res = await this.db.query(`UPDATE src.invitation SET status = 'Cancelled', cancelled_at = now(), cancel_reason = 'REQUEST_CLOSED', version = version + 1, updated_at = now()
        WHERE id IN (SELECT i.id FROM src.invitation i JOIN req.blood_request r ON r.id = i.request_id
                      WHERE i.status IN ('Queued','Sent','Delivered','Viewed') AND r.status IN ('Cancelled','Rejected','Unable to fulfil','Closed') LIMIT $1)`, [limit]);
        return res.rowCount ?? 0;
    }
    async dispatchDue(limit = 100) {
        return this.db.transaction(async (tx) => {
            // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
            const due = await tx.query(`SELECT i.id, i.request_id, i.match_run_id FROM src.invitation i JOIN req.blood_request r ON r.id = i.request_id
          WHERE i.status = 'Queued' AND i.queued_at <= now() AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          ORDER BY i.queued_at LIMIT $1 FOR UPDATE OF i SKIP LOCKED`, [limit]);
            for (const i of due.rows) {
                await tx.orm
                    .update(schema_1.invitation)
                    .set({ status: 'Sent', sentAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                    .where((0, drizzle_orm_1.eq)(schema_1.invitation.id, i.id));
                await (0, request_public_1.markFirstInvited)(tx, [i.request_id]);
                await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationSent', payload: { requestId: i.request_id } });
            }
            const runs = [...new Set(due.rows.map((i) => i.match_run_id))];
            if (runs.length > 0) {
                const queued = tx.orm.select({ id: schema_1.invitation.id }).from(schema_1.invitation).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invitation.matchRunId, schema_1.matchRun.id), (0, drizzle_orm_1.eq)(schema_1.invitation.status, 'Queued')));
                await tx.orm
                    .update(schema_1.matchRun)
                    .set({ status: 'Awaiting responses', version: (0, drizzle_orm_1.sql) `${schema_1.matchRun.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.matchRun.id, runs), (0, drizzle_orm_1.eq)(schema_1.matchRun.status, 'Dispatching'), (0, drizzle_orm_1.notExists)(queued)));
            }
            return due.rows.length;
        });
    }
    async expireDue(limit = 200) {
        return this.db.transaction(async (tx) => {
            // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
            const expired = await tx.query(`UPDATE src.invitation SET status = 'Expired', expired_at = now(), version = version + 1, updated_at = now()
          WHERE id IN (SELECT id FROM src.invitation WHERE status IN ('Sent','Delivered','Viewed') AND expires_at <= now()
                        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)
          RETURNING id, request_id`, [limit]);
            for (const i of expired.rows) {
                await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationExpired', payload: { requestId: i.request_id } });
            }
            return expired.rows.length;
        });
    }
    async reaskDue(limit = 100) {
        return this.db.transaction(async (tx) => {
            // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
            const due = await tx.query(`SELECT i.id, i.request_id, r.urgency::text AS urgency
           FROM src.invitation i
           JOIN req.blood_request r ON r.id = i.request_id
           JOIN idn.donor_profile d ON d.id = i.donor_profile_id
          WHERE i.status = 'Responded' AND i.response = 'Later' AND i.later_recheck_at <= now() AND COALESCE(i.reask_count, 0) < 1
            AND r.status IN ('Verified','Searching','Donor coordination') AND r.required_by > now() AND r.deleted_at IS NULL
            AND NOT r.outreach_paused AND NOT r.has_moderation_hold
            AND d.donor_status = 'Active'
          ORDER BY i.later_recheck_at LIMIT $1 FOR UPDATE OF i SKIP LOCKED`, [limit]);
            for (const i of due.rows) {
                await tx.orm
                    .update(schema_1.invitation)
                    .set({
                    status: 'Sent', response: null, respondedAt: null, sentAt: (0, drizzle_orm_1.sql) `now()`, laterRecheckAt: null, reaskCount: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.invitation.reaskCount}, 0) + 1`,
                    expiresAt: (0, drizzle_orm_1.sql) `now() + make_interval(mins => ${(0, matching_rules_1.responseWindowMinutes)(i.urgency)}::int)`, version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()`,
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.invitation.id, i.id));
                await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationSent', payload: { requestId: i.request_id, reask: true } });
            }
            return due.rows.length;
        });
    }
    async lock(tx, principal, id) {
        const donorProfileId = await (0, read_model_public_1.donorProfileIdOf)(tx, principal.userId);
        if (!donorProfileId)
            throw new common_1.NotFoundException({ code: 'INVITATION_NOT_FOUND' });
        const [row] = await tx.orm
            .select(COLUMNS)
            .from(schema_1.invitation)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invitation.id, id), (0, drizzle_orm_1.eq)(schema_1.invitation.donorProfileId, donorProfileId), (0, drizzle_orm_1.notInArray)(schema_1.invitation.status, ['Queued', 'Cancelled'])))
            .for('update');
        if (!row)
            throw new common_1.NotFoundException({ code: 'INVITATION_NOT_FOUND' });
        return row;
    }
};
exports.InvitationService = InvitationService;
exports.InvitationService = InvitationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService,
        case_workflow_public_1.CaseService])
], InvitationService);
function view(r) {
    const closed = r.status === 'Expired' || r.status === 'Cancelled' || r.status === 'Withdrawn';
    return {
        id: r.id,
        status: r.status,
        response: r.response,
        expiresAt: r.expiresAt,
        sentAt: r.sentAt,
        respondedAt: r.respondedAt,
        details: closed ? null : r.payloadSnapshot,
        notice: 'The collection service will check whether you are able to donate.',
    };
}
//# sourceMappingURL=invitation.service.js.map