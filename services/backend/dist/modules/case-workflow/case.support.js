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
exports.CaseSupport = exports.CASE_COLUMNS = exports.fail = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const policy_service_1 = require("../../platform/policy/policy.service");
const area_scope_1 = require("../../platform/policy/area-scope");
const status_history_service_1 = require("../../platform/status/status-history.service");
const case_status_1 = require("./case-status");
const schema_1 = require("./schema");
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
exports.fail = fail;
exports.CASE_COLUMNS = {
    id: schema_1.coordinationCase.id, caseNo: schema_1.coordinationCase.caseNo, requestId: schema_1.coordinationCase.requestId, status: schema_1.coordinationCase.status,
    ownerUserId: schema_1.coordinationCase.ownerUserId, priority: schema_1.coordinationCase.priority, areaId: schema_1.coordinationCase.areaId,
    disputed: schema_1.coordinationCase.disputed, version: schema_1.coordinationCase.version,
};
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
        const query = db.orm.select(exports.CASE_COLUMNS).from(schema_1.coordinationCase).where((0, drizzle_orm_1.eq)(schema_1.coordinationCase.id, caseId));
        const [row] = lock ? await query.for('update') : await query;
        if (!row)
            throw new common_1.NotFoundException({ code: 'CASE_NOT_FOUND' });
        return row;
    }
    async requireAccess(db, principal, row, key) {
        const decision = this.policy.decide(principal, key, {
            resource: { assignedUserIds: row.ownerUserId ? [row.ownerUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
            principalAreaIds: await (0, area_scope_1.staffAreaIds)(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.NotFoundException({ code: 'CASE_NOT_FOUND' });
    }
    async moveCase(tx, row, to, actor, reason) {
        if (row.status === to)
            return row;
        await tx.orm
            .update(schema_1.coordinationCase)
            .set({
            status: to,
            ...(to === 'Resolved' ? { resolvedAt: (0, drizzle_orm_1.sql) `now()` } : to === 'Closed' ? { closedAt: (0, drizzle_orm_1.sql) `now()` } : {}),
            version: (0, drizzle_orm_1.sql) `${schema_1.coordinationCase.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()`,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.coordinationCase.id, row.id));
        await this.history.record(tx, {
            entityType: 'COORDINATION_CASE', entityId: row.id, from: row.status, to, actorUserId: actor.userId, actorRole: actor.role,
            source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: row.requestId, reason, correlationId: (0, node_crypto_1.randomUUID)(),
        }, case_status_1.caseStateMachine);
        return { ...row, status: to };
    }
    async moveAppointment(tx, id, requestId, from, to, actor, changes = {}) {
        case_status_1.appointmentStateMachine.assert(from, to);
        await tx.orm
            .update(schema_1.appointment)
            .set({ status: to, ...changes, version: (0, drizzle_orm_1.sql) `${schema_1.appointment.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.eq)(schema_1.appointment.id, id));
        await this.history.record(tx, {
            entityType: 'APPOINTMENT', entityId: id, from, to, actorUserId: actor.userId, actorRole: actor.role,
            source: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER', contextRequestId: requestId, correlationId: (0, node_crypto_1.randomUUID)(),
        });
    }
    async openTask(tx, caseRow, type, dedupeKey, dueMinutes, caseDonorId) {
        await tx.orm
            .insert(schema_1.caseTask)
            .values({
            caseId: caseRow.id, requestId: caseRow.requestId, caseDonorId: caseDonorId ?? null, taskType: type, status: 'Open',
            assigneeUserId: caseRow.ownerUserId, dueAt: (0, drizzle_orm_1.sql) `now() + make_interval(mins => ${dueMinutes}::int)`, dedupeKey,
        })
            .onConflictDoNothing();
    }
    async finishTask(tx, caseId, type, userId, status = 'Done') {
        await tx.orm
            .update(schema_1.caseTask)
            .set({ status, completedBy: userId, completedAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.caseTask.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseTask.caseId, caseId), (0, drizzle_orm_1.eq)(schema_1.caseTask.taskType, type), (0, drizzle_orm_1.inArray)(schema_1.caseTask.status, ['Open', 'In progress'])));
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