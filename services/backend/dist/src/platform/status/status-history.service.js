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
exports.StatusHistoryService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
let StatusHistoryService = class StatusHistoryService {
    audit;
    constructor(audit) {
        this.audit = audit;
    }
    async record(tx, change, machine) {
        if (machine && change.from !== null)
            machine.assert(change.from, change.to);
        await tx.query(`INSERT INTO aud.status_history
         (entity_type, entity_id, context_request_id, from_status, to_status, actor_user_id, actor_role,
          source, reason_code, reason, correlation_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`, [
            change.entityType,
            change.entityId,
            change.contextRequestId ?? null,
            change.from,
            change.to,
            change.actorUserId,
            change.actorRole,
            change.source,
            change.reasonCode ?? null,
            change.reason ?? null,
            change.correlationId,
            change.details ? JSON.stringify(change.details) : null,
        ]);
        await this.audit.record(tx, {
            category: 'STATUS_CHANGE',
            action: 'STATUS_CHANGE',
            result: 'SUCCESS',
            actorUserId: change.actorUserId,
            actorRole: change.actorRole,
            entityType: change.entityType,
            entityId: change.entityId,
            contextRequestId: change.contextRequestId,
            changes: { from: change.from, to: change.to },
            correlationId: change.correlationId,
        });
    }
};
exports.StatusHistoryService = StatusHistoryService;
exports.StatusHistoryService = StatusHistoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], StatusHistoryService);
//# sourceMappingURL=status-history.service.js.map