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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaseSupport = exports.fail = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const policy_service_1 = require("../../platform/policy/policy.service");
const area_scope_1 = require("../../platform/policy/area-scope");
const status_history_service_1 = require("../../platform/status/status-history.service");
const case_status_1 = require("./case-status");
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
exports.fail = fail;
const CASE_COLUMNS = 'c.id, c.case_no, c.request_id, c.status, c.owner_user_id, c.priority, c.area_id, c.disputed, c.version';
let CaseSupport = class CaseSupport {
    policy;
    history;
    outbox;
    constructor(policy, history, outbox) {
        this.policy = policy;
        this.history = history;
        this.outbox = outbox;
    }
    async loadCase(db, caseId, lock) {
        const { rows } = await db.query(`SELECT ${CASE_COLUMNS} FROM crd.coordination_case c WHERE c.id = $1 ${lock ? 'FOR UPDATE OF c' : ''}`, [caseId]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'CASE_NOT_FOUND' });
        return rows[0];
    }
    async requireAccess(db, principal, row, key) {
        const decision = this.policy.decide(principal, key, {
            resource: { assignedUserIds: row.owner_user_id ? [row.owner_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
            principalAreaIds: await (0, area_scope_1.staffAreaIds)(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.NotFoundException({ code: 'CASE_NOT_FOUND' });
    }
    async moveCase(tx, row, to, actor, reason) {
        if (row.status === to)
            return row;
        const extra = to === 'Resolved' ? ', resolved_at = now()' : to === 'Closed' ? ', closed_at = now()' : to === 'Open' && row.status === 'Needs replacement' ? '' : '';
        await tx.query(`UPDATE crd.coordination_case SET status = $2${extra}, version = version + 1, updated_at = now() WHERE id = $1`, [row.id, to]);
        await this.history.record(tx, {
            entityType: 'COORDINATION_CASE', entityId: row.id, from: row.status, to, actorUserId: actor.userId, actorRole: actor.role,
            source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: row.request_id, reason, correlationId: (0, node_crypto_1.randomUUID)(),
        }, case_status_1.caseStateMachine);
        return { ...row, status: to };
    }
    async moveAppointment(tx, id, requestId, from, to, actor, set = '') {
        case_status_1.appointmentStateMachine.assert(from, to);
        await tx.query(`UPDATE crd.appointment SET status = $2${set}, version = version + 1, updated_at = now() WHERE id = $1`, [id, to]);
        await this.history.record(tx, {
            entityType: 'APPOINTMENT', entityId: id, from, to, actorUserId: actor.userId, actorRole: actor.role,
            source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: requestId, correlationId: (0, node_crypto_1.randomUUID)(),
        });
    }
    async openTask(tx, caseRow, type, dedupeKey, dueMinutes, caseDonorId) {
        await tx.query(`INSERT INTO crd.case_task (case_id, request_id, case_donor_id, task_type, status, assignee_user_id, due_at, dedupe_key)
       VALUES ($1, $2, $3, $4::case_task_type, 'Open', $5, now() + make_interval(mins => $6), $7)
       ON CONFLICT DO NOTHING`, [caseRow.id, caseRow.request_id, caseDonorId ?? null, type, caseRow.owner_user_id, dueMinutes, dedupeKey]);
    }
    async finishTask(tx, caseId, type, userId, status = 'Done') {
        await tx.query(`UPDATE crd.case_task SET status = $4::task_status, completed_by = $3, completed_at = now(), version = version + 1, updated_at = now()
        WHERE case_id = $1 AND task_type = $2::case_task_type AND status IN ('Open','In progress')`, [caseId, type, userId, status]);
    }
    event(tx, aggregateType, aggregateId, eventType, payload, version) {
        return this.outbox.append(tx, { aggregateType, aggregateId, eventType, payload, version });
    }
};
exports.CaseSupport = CaseSupport;
exports.CaseSupport = CaseSupport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [policy_service_1.PolicyService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService])
], CaseSupport);
//# sourceMappingURL=case.support.js.map