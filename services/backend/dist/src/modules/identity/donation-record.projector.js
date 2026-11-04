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
exports.DonationRecordProjector = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const event_bus_1 = require("../../platform/outbox/event-bus");
const DONATION_SOURCE_BY_OUTCOME_SOURCE = {
    COLLECTION_SERVICE_CONFIRMATION: 'COLLECTION_SERVICE_CONFIRMATION',
    PARTNER_INTEGRATION: 'PARTNER_INTEGRATION',
};
let DonationRecordProjector = class DonationRecordProjector {
    db;
    bus;
    audit;
    constructor(db, bus, audit) {
        this.db = db;
        this.bus = bus;
        this.audit = audit;
    }
    onModuleInit() {
        this.bus.subscribe('OutcomeRecorded', (event) => this.handle(event));
    }
    async handle(event) {
        const p = event.payload;
        const source = DONATION_SOURCE_BY_OUTCOME_SOURCE[p.sourceType];
        if (p.outcomeType !== 'DONATION_COMPLETED' || p.confidence !== 'Service-confirmed' || !source)
            return;
        if (!p.caseDonorId || !p.donorProfileId)
            return;
        await this.db.transaction(async (tx) => {
            const inserted = await tx.query(`INSERT INTO idn.donation_record
           (donor_profile_id, donation_date, source, verified, verification_status, case_donor_id, outcome_update_id, counts_for_next_contact)
         VALUES ($1, ($2::timestamptz AT TIME ZONE 'Asia/Dhaka')::date, $3::donation_source, true, 'Service-confirmed', $4, $5, true)
         ON CONFLICT (case_donor_id) DO NOTHING
         RETURNING id, donation_date::text AS donation_date`, [p.donorProfileId, p.reportedAt, source, p.caseDonorId, p.outcomeId]);
            const record = inserted.rows[0];
            if (!record)
                return;
            await tx.query(`UPDATE idn.donor_profile
            SET last_donation_date = GREATEST(last_donation_date, $2::date), version = version + 1, updated_at = now()
          WHERE id = $1`, [p.donorProfileId, record.donation_date]);
            await this.audit.record(tx, {
                category: 'DATA_CHANGE',
                action: 'DonationRecorded',
                result: 'SUCCESS',
                actorUserId: null,
                actorRole: 'SYSTEM',
                entityType: 'DONATION_RECORD',
                entityId: record.id,
                correlationId: (0, node_crypto_1.randomUUID)(),
                changes: { source, donationDate: record.donation_date, outcomeId: p.outcomeId },
            });
        });
    }
};
exports.DonationRecordProjector = DonationRecordProjector;
exports.DonationRecordProjector = DonationRecordProjector = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(event_bus_1.EventBus)),
    __param(2, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        event_bus_1.EventBus,
        audit_service_1.AuditService])
], DonationRecordProjector);
//# sourceMappingURL=donation-record.projector.js.map