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
exports.AuditWriter = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../platform/db/database.service");
const event_bus_1 = require("../../platform/outbox/event-bus");
const hash_chain_1 = require("./hash-chain");
let AuditWriter = class AuditWriter {
    db;
    bus;
    constructor(db, bus) {
        this.db = db;
        this.bus = bus;
    }
    onModuleInit() {
        this.bus.subscribe('AuditRecorded', (event) => this.write(event));
    }
    async write(event) {
        const p = event.payload;
        await this.db.transaction(async (tx) => {
            await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['aud.audit_event.chain']);
            const last = await tx.query('SELECT chain_seq, hash FROM aud.audit_event ORDER BY chain_seq DESC LIMIT 1');
            const prevHash = last.rows[0]?.hash ?? hash_chain_1.GENESIS_HASH;
            const chainSeq = last.rows[0] ? BigInt(last.rows[0].chain_seq) + 1n : 1n;
            const hash = (0, hash_chain_1.chainHash)(prevHash, (0, hash_chain_1.auditHashRecord)({ ...p, chainSeq }));
            await tx.query(`INSERT INTO aud.audit_event
           (occurred_at, category, action, result, actor_user_id, actor_role, permission_used, entity_type,
            entity_id, subject_user_id, context_request_id, field_group, reason_code, reason_text, changes,
            correlation_id, chain_seq, prev_hash, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)`, [
                p.occurredAt, p.category, p.action, p.result, p.actorUserId ?? null, p.actorRole,
                p.permissionUsed ?? null, p.entityType ?? null, p.entityId ?? null, p.subjectUserId ?? null,
                p.contextRequestId ?? null, p.fieldGroup ?? null, p.reasonCode ?? null, p.reasonText ?? null,
                p.changes ? JSON.stringify(p.changes) : null, p.correlationId, chainSeq.toString(), prevHash, hash,
            ]);
        });
    }
};
exports.AuditWriter = AuditWriter;
exports.AuditWriter = AuditWriter = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(event_bus_1.EventBus)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        event_bus_1.EventBus])
], AuditWriter);
//# sourceMappingURL=audit-writer.js.map