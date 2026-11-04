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
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const case_workflow_public_1 = require("../case-workflow/case-workflow.public");
const request_public_1 = require("../request/request.public");
const matching_rules_1 = require("./matching.rules");
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
        const { rows } = await this.db.query(`SELECT i.id, i.request_id, i.status, i.response, i.expires_at, i.sent_at, i.viewed_at, i.responded_at, i.payload_snapshot, i.donor_profile_id
         FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id
        WHERE d.user_id = $1 AND i.status IN ('Sent','Delivered','Viewed','Responded','Expired')
          AND i.sent_at > now() - interval '30 days' ORDER BY i.sent_at DESC LIMIT 50`, [principal.userId]);
        return rows.map(view);
    }
    async open(principal, id) {
        return this.db.transaction(async (tx) => {
            const row = await this.lock(tx, principal, id);
            if (OPEN.slice(0, 2).includes(row.status) && row.expires_at.getTime() > Date.now()) {
                await tx.query(`UPDATE src.invitation SET status = 'Viewed', viewed_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [id]);
                return view({ ...row, status: 'Viewed', viewed_at: new Date() });
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
                const seen = await tx.query('SELECT 1 FROM src.invitation_response WHERE invitation_id = $1 AND client_mutation_id = $2', [id, dto.clientMutationId]);
                if (seen.rows[0])
                    return view(row);
            }
            if (!OPEN.includes(row.status) || row.expires_at.getTime() <= Date.now())
                throw fail('INVITATION_CLOSED', common_1.HttpStatus.GONE);
            await tx.query(`INSERT INTO src.invitation_response (invitation_id, response_value, later_available_at, channel, client_mutation_id)
         VALUES ($1, $2::invitation_response_value, $3, 'IN_APP', $4)`, [id, dto.response, later, dto.clientMutationId ?? null]);
            await tx.query(`UPDATE src.invitation SET status = 'Responded', response = $2::invitation_response_value, responded_at = now(),
                later_recheck_at = $3, version = version + 1, updated_at = now() WHERE id = $1`, [id, dto.response, later]);
            await tx.query(`UPDATE idn.donor_profile SET last_response_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [row.donor_profile_id]);
            if (dto.response === 'Available') {
                await this.firstWilling(tx, row.request_id);
                await this.cases.linkAvailableDonor(tx, { requestId: row.request_id, invitationId: id, donorProfileId: row.donor_profile_id });
            }
            await this.outbox.append(tx, {
                aggregateType: 'INVITATION', aggregateId: id, eventType: 'InvitationResponded', payload: { response: dto.response, requestId: row.request_id },
            });
            return view({ ...row, status: 'Responded', response: dto.response, responded_at: new Date() });
        });
    }
    async withdraw(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const row = await this.lock(tx, principal, id);
            if (row.status === 'Withdrawn')
                return view(row);
            if (row.status !== 'Responded' || row.response !== 'Available')
                throw fail('INVALID_TRANSITION');
            await tx.query(`INSERT INTO src.invitation_response (invitation_id, response_value, is_withdrawal, withdrawal_reason, channel)
         VALUES ($1, NULL, true, $2::withdrawal_reason, 'IN_APP')`, [id, dto.reason]);
            await tx.query(`UPDATE src.invitation SET status = 'Withdrawn', withdrawn_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [id]);
            await this.cases.handleDonorLeft(tx, { invitationId: id, kind: 'WITHDRAWN', actorUserId: principal.userId, actorRole: 'DON' });
            await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: id, eventType: 'InvitationWithdrawn', payload: { requestId: row.request_id } });
            return view({ ...row, status: 'Withdrawn' });
        });
    }
    async cancelForEndedRequests(limit = 200) {
        const res = await this.db.query(`UPDATE src.invitation SET status = 'Cancelled', cancelled_at = now(), cancel_reason = 'REQUEST_CLOSED', version = version + 1, updated_at = now()
        WHERE id IN (SELECT i.id FROM src.invitation i JOIN req.blood_request r ON r.id = i.request_id
                      WHERE i.status IN ('Queued','Sent','Delivered','Viewed') AND r.status IN ('Cancelled','Rejected','Unable to fulfil','Closed') LIMIT $1)`, [limit]);
        return res.rowCount ?? 0;
    }
    async dispatchDue(limit = 100) {
        return this.db.transaction(async (tx) => {
            const due = await tx.query(`SELECT i.id, i.request_id, i.match_run_id FROM src.invitation i JOIN req.blood_request r ON r.id = i.request_id
          WHERE i.status = 'Queued' AND i.queued_at <= now() AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          ORDER BY i.queued_at LIMIT $1 FOR UPDATE OF i SKIP LOCKED`, [limit]);
            for (const i of due.rows) {
                await tx.query(`UPDATE src.invitation SET status = 'Sent', sent_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [i.id]);
                await tx.query(`UPDATE req.blood_request SET first_invited_at = COALESCE(first_invited_at, now()) WHERE id = $1`, [i.request_id]);
                await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationSent', payload: { requestId: i.request_id } });
            }
            const runs = [...new Set(due.rows.map((i) => i.match_run_id))];
            if (runs.length > 0) {
                await tx.query(`UPDATE src.match_run m SET status = 'Awaiting responses', version = version + 1, updated_at = now()
            WHERE m.id = ANY($1::uuid[]) AND m.status = 'Dispatching'
              AND NOT EXISTS (SELECT 1 FROM src.invitation i WHERE i.match_run_id = m.id AND i.status = 'Queued')`, [runs]);
            }
            return due.rows.length;
        });
    }
    async expireDue(limit = 200) {
        return this.db.transaction(async (tx) => {
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
                await tx.query(`UPDATE src.invitation SET status = 'Sent', response = NULL, responded_at = NULL, sent_at = now(), later_recheck_at = NULL,
                  reask_count = COALESCE(reask_count, 0) + 1, expires_at = now() + make_interval(mins => $2), version = version + 1, updated_at = now()
            WHERE id = $1`, [i.id, (0, matching_rules_1.responseWindowMinutes)(i.urgency)]);
                await this.outbox.append(tx, { aggregateType: 'INVITATION', aggregateId: i.id, eventType: 'InvitationSent', payload: { requestId: i.request_id, reask: true } });
            }
            return due.rows.length;
        });
    }
    async firstWilling(tx, requestId) {
        const { rows } = await tx.query('SELECT status FROM req.blood_request WHERE id = $1 FOR UPDATE', [requestId]);
        await tx.query('UPDATE req.blood_request SET first_willing_at = COALESCE(first_willing_at, now()) WHERE id = $1', [requestId]);
        if (rows[0]?.status !== 'Searching')
            return;
        await tx.query(`UPDATE req.blood_request SET status = 'Donor coordination', version = version + 1, updated_at = now() WHERE id = $1`, [requestId]);
        await this.history.record(tx, {
            entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Searching', to: 'Donor coordination', actorUserId: null,
            actorRole: 'SYSTEM', source: 'SYSTEM', contextRequestId: requestId, reasonCode: 'FIRST_AVAILABLE_RESPONSE', correlationId: (0, node_crypto_1.randomUUID)(),
        }, request_public_1.requestStateMachine);
    }
    async lock(tx, principal, id) {
        const { rows } = await tx.query(`SELECT i.id, i.request_id, i.status, i.response, i.expires_at, i.sent_at, i.viewed_at, i.responded_at, i.payload_snapshot, i.donor_profile_id
         FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id
        WHERE i.id = $1 AND d.user_id = $2 AND i.status <> 'Queued' AND i.status <> 'Cancelled' FOR UPDATE OF i`, [id, principal.userId]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'INVITATION_NOT_FOUND' });
        return rows[0];
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
        expiresAt: r.expires_at,
        sentAt: r.sent_at,
        respondedAt: r.responded_at,
        details: closed ? null : r.payload_snapshot,
        notice: 'The collection service will check whether you are able to donate.',
    };
}
//# sourceMappingURL=invitation.service.js.map