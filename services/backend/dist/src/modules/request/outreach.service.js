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
exports.OutreachService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const area_scope_1 = require("../../platform/policy/area-scope");
const policy_service_1 = require("../../platform/policy/policy.service");
const PAUSABLE = ['Verified', 'Searching', 'Donor coordination'];
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
let OutreachService = class OutreachService {
    db;
    policy;
    outbox;
    constructor(db, policy, outbox) {
        this.db = db;
        this.policy = policy;
        this.outbox = outbox;
    }
    pause(principal, requestId, reason) {
        return this.change(principal, requestId, true, reason);
    }
    resume(principal, requestId) {
        return this.change(principal, requestId, false);
    }
    change(principal, requestId, pause, reason) {
        return this.db.transaction(async (tx) => {
            const { rows } = await tx.query(`SELECT id, status::text AS status, area_id, assigned_support_user_id, outreach_paused, version
           FROM req.blood_request WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [requestId]);
            const row = rows[0];
            if (!row)
                throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
            const decision = this.policy.decide(principal, 'outreach.pause', {
                resource: { assignedUserIds: row.assigned_support_user_id ? [row.assigned_support_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
                principalAreaIds: await (0, area_scope_1.staffAreaIds)(tx, principal.userId),
            });
            if (!decision.allowed)
                throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
            if (pause) {
                if (!PAUSABLE.includes(row.status))
                    throw fail('INVALID_TRANSITION');
                if (row.outreach_paused)
                    return { requestId, outreachPaused: true };
                await tx.query(`UPDATE req.blood_request SET outreach_paused = true, outreach_paused_reason = $2, outreach_paused_by = $3, outreach_paused_at = now(),
                  version = version + 1, updated_at = now() WHERE id = $1`, [requestId, reason, principal.userId]);
            }
            else {
                if (!row.outreach_paused)
                    return { requestId, outreachPaused: false };
                await tx.query(`UPDATE req.blood_request SET outreach_paused = false, outreach_paused_reason = NULL, outreach_paused_by = NULL, outreach_paused_at = NULL,
                  version = version + 1, updated_at = now() WHERE id = $1`, [requestId]);
            }
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: requestId, eventType: pause ? 'OutreachPaused' : 'OutreachResumed',
                payload: { requestId, by: principal.userId, ...(pause ? { reason } : {}) }, version: row.version + 1,
            });
            return { requestId, outreachPaused: pause };
        });
    }
};
exports.OutreachService = OutreachService;
exports.OutreachService = OutreachService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        policy_service_1.PolicyService,
        outbox_service_1.OutboxService])
], OutreachService);
//# sourceMappingURL=outreach.service.js.map