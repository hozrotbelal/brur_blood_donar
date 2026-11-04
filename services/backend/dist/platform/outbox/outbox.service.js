"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxService = exports.outboxDedupeKey = void 0;
const common_1 = require("@nestjs/common");
const schema_1 = require("../db/schema");
const outboxDedupeKey = (e) => `${e.aggregateType}:${e.aggregateId}:${e.eventType}:${e.version ?? 1}`;
exports.outboxDedupeKey = outboxDedupeKey;
let OutboxService = class OutboxService {
    async append(tx, event) {
        await tx.orm
            .insert(schema_1.outboxEvent)
            .values({ aggregateType: event.aggregateType, aggregateId: event.aggregateId, eventType: event.eventType, payload: event.payload, dedupeKey: (0, exports.outboxDedupeKey)(event), status: 'Pending' })
            .onConflictDoNothing({ target: schema_1.outboxEvent.dedupeKey });
    }
};
exports.OutboxService = OutboxService;
exports.OutboxService = OutboxService = __decorate([
    (0, common_1.Injectable)()
], OutboxService);
//# sourceMappingURL=outbox.service.js.map