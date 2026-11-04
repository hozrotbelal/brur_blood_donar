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
exports.AuditService = void 0;
exports.validateAuditEntry = validateAuditEntry;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const outbox_service_1 = require("../outbox/outbox.service");
const REASON_REQUIRED = ['SENSITIVE_READ', 'EXPORT', 'PERMISSION', 'APPROVAL'];
function validateAuditEntry(entry) {
    if ((entry.actorRole === 'SYSTEM') !== (entry.actorUserId === null)) {
        throw new common_1.BadRequestException('SYSTEM actor must have no user id, and other roles must have one');
    }
    if (entry.result === 'SUCCESS' && REASON_REQUIRED.includes(entry.category) && !entry.reasonCode) {
        throw new common_1.BadRequestException(`${entry.category} with result SUCCESS requires a reason code`);
    }
}
let AuditService = class AuditService {
    outbox;
    constructor(outbox) {
        this.outbox = outbox;
    }
    async record(tx, entry) {
        validateAuditEntry(entry);
        await this.outbox.append(tx, {
            aggregateType: 'AUDIT',
            aggregateId: (0, node_crypto_1.randomUUID)(),
            eventType: 'AuditRecorded',
            payload: { ...entry, occurredAt: new Date().toISOString() },
        });
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [outbox_service_1.OutboxService])
], AuditService);
//# sourceMappingURL=audit.service.js.map