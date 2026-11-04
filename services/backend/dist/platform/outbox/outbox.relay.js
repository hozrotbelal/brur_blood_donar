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
exports.OutboxRelay = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../db/database.service");
const event_bus_1 = require("./event-bus");
let OutboxRelay = class OutboxRelay {
    db;
    bus;
    constructor(db, bus) {
        this.db = db;
        this.bus = bus;
    }
    async publishPending(batchSize = 50) {
        return this.db.transaction(async (tx) => {
            const { rows } = await tx.query(`SELECT id, aggregate_type, aggregate_id, event_type, payload
           FROM platform.outbox_event
          WHERE status = 'Pending'
          ORDER BY created_at
          LIMIT $1
          FOR NO KEY UPDATE SKIP LOCKED`, [batchSize]);
            for (const row of rows) {
                try {
                    await this.bus.publish({
                        id: row.id,
                        aggregateType: row.aggregate_type,
                        aggregateId: row.aggregate_id,
                        eventType: row.event_type,
                        payload: row.payload,
                    });
                    await tx.query("UPDATE platform.outbox_event SET status = 'Published', published_at = now() WHERE id = $1", [
                        row.id,
                    ]);
                }
                catch {
                    await tx.query("UPDATE platform.outbox_event SET status = 'Failed' WHERE id = $1", [row.id]);
                }
            }
            return rows.length;
        });
    }
};
exports.OutboxRelay = OutboxRelay;
exports.OutboxRelay = OutboxRelay = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(event_bus_1.EventBus)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        event_bus_1.EventBus])
], OutboxRelay);
//# sourceMappingURL=outbox.relay.js.map