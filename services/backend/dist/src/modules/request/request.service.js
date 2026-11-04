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
exports.RequestService = void 0;
exports.toRequestView = toRequestView;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const policy_service_1 = require("../../platform/policy/policy.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const identity_public_1 = require("../identity/identity.public");
const request_flags_1 = require("./request-flags");
const request_status_1 = require("./request-status");
const COLUMNS = `r.id, r.reference_no, r.patient_id, r.requested_blood_group, r.component, r.quantity_units, r.required_by, r.urgency,
  r.status, r.outreach_paused, r.fulfilled_quantity_units, r.cancel_reason, r.submitted_at, r.verified_at, r.first_invited_at,
  r.first_willing_at, r.outcome_confirmed_at, r.fulfilled_at, r.created_at, r.version`;
const OWNED = `(r.created_by_user_id = $1 OR EXISTS (
  SELECT 1 FROM req.representative_link l
   WHERE l.id = r.representative_link_id AND l.user_id = $1 AND l.status = 'Active' AND l.authorized))`;
function toRequestView(row) {
    return {
        id: row.id,
        referenceNo: row.reference_no,
        patientId: row.patient_id,
        requestedBloodGroup: row.requested_blood_group,
        component: row.component,
        quantityUnits: row.quantity_units,
        requiredBy: row.required_by,
        urgency: row.urgency,
        status: row.status,
        outreachPaused: row.outreach_paused,
        cancelReason: row.cancel_reason,
        createdAt: row.created_at,
        version: row.version,
        milestones: {
            submittedAt: row.submitted_at,
            verifiedAt: row.verified_at,
            searchStartedAt: row.first_invited_at,
            donorWillingAt: row.first_willing_at,
            outcomeConfirmedAt: row.outcome_confirmed_at,
            fulfilledAt: row.fulfilled_at,
        },
    };
}
let RequestService = class RequestService {
    db;
    policy;
    history;
    outbox;
    constructor(db, policy, history, outbox) {
        this.db = db;
        this.policy = policy;
        this.history = history;
        this.outbox = outbox;
    }
    async createPatient(principal, dto) {
        return this.db.transaction(async (tx) => {
            const patient = await tx.query(`INSERT INTO req.patient (display_name, year_of_birth, hospital_patient_ref, created_by_user_id)
         VALUES ($1, $2, $3, $4) RETURNING id`, [dto.displayName, dto.yearOfBirth ?? null, dto.hospitalPatientRef ?? null, principal.userId]);
            const patientId = patient.rows[0].id;
            const link = await tx.query(`INSERT INTO req.representative_link (user_id, patient_id, relationship, authorized, is_primary, status)
         VALUES ($1, $2, $3, true, true, 'Active') RETURNING id`, [principal.userId, patientId, dto.relationship]);
            await this.outbox.append(tx, {
                aggregateType: 'PATIENT', aggregateId: patientId, eventType: 'PatientRegistered', payload: { linkId: link.rows[0].id },
            });
            return { id: patientId, displayName: dto.displayName, relationship: dto.relationship };
        });
    }
    async listPatients(principal) {
        const { rows } = await this.db.query(`SELECT p.id, p.display_name, l.relationship
         FROM req.representative_link l JOIN req.patient p ON p.id = l.patient_id
        WHERE l.user_id = $1 AND l.status = 'Active' AND p.deleted_at IS NULL ORDER BY p.created_at`, [principal.userId]);
        return rows.map((r) => ({ id: r.id, displayName: r.display_name, relationship: r.relationship }));
    }
    async createRequest(principal, dto) {
        const requiredBy = new Date(dto.requiredBy);
        if (requiredBy.getTime() <= Date.now())
            throw new common_1.HttpException({ code: 'REQUIRED_BY_IN_PAST' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
        const contact = (0, identity_public_1.normalizeBdPhone)(dto.contactPhone);
        if (!contact)
            throw new common_1.HttpException({ code: 'INVALID_PHONE' }, common_1.HttpStatus.BAD_REQUEST);
        const alt = dto.altContactPhone ? (0, identity_public_1.normalizeBdPhone)(dto.altContactPhone) : null;
        if (dto.altContactPhone && !alt)
            throw new common_1.HttpException({ code: 'INVALID_PHONE' }, common_1.HttpStatus.BAD_REQUEST);
        return this.db.transaction(async (tx) => {
            const link = await tx.query(`SELECT id FROM req.representative_link
          WHERE user_id = $1 AND patient_id = $2 AND status = 'Active' AND authorized`, [principal.userId, dto.patientId]);
            if (!link.rows[0])
                throw new common_1.NotFoundException({ code: 'PATIENT_NOT_FOUND' });
            const inserted = await tx.query(`INSERT INTO req.blood_request
           (patient_id, representative_link_id, created_by_user_id, contact_phone, alt_contact_phone, hospital_facility_id, area_id,
            requested_blood_group, component, quantity_units, required_by, urgency, special_instructions,
            preferred_support_contact, client_mutation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (created_by_user_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL DO NOTHING
         RETURNING id`, [
                dto.patientId, link.rows[0].id, principal.userId, contact, alt, dto.hospitalFacilityId ?? null, dto.areaId ?? null,
                dto.requestedBloodGroup, dto.component, dto.quantityUnits, requiredBy, dto.urgency, dto.specialInstructions ?? null,
                dto.preferredSupportContact ?? null, dto.clientMutationId ?? null,
            ]);
            let id = inserted.rows[0]?.id;
            if (!id) {
                const existing = await tx.query('SELECT id FROM req.blood_request WHERE created_by_user_id = $1 AND client_mutation_id = $2', [principal.userId, dto.clientMutationId]);
                id = existing.rows[0].id;
            }
            else {
                await this.history.record(tx, {
                    entityType: 'BLOOD_REQUEST', entityId: id, from: null, to: 'Draft', actorUserId: principal.userId,
                    actorRole: 'PAT', source: 'USER', contextRequestId: id, correlationId: (0, node_crypto_1.randomUUID)(),
                });
            }
            return this.getOwned(tx, principal, id);
        });
    }
    async listRequests(principal) {
        const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM req.blood_request r WHERE ${OWNED} ORDER BY r.created_at DESC LIMIT 100`, [principal.userId]);
        return rows.map(toRequestView);
    }
    async getRequest(principal, id) {
        return this.getOwned(this.db, principal, id);
    }
    async submit(principal, id) {
        return this.db.transaction(async (tx) => {
            const current = await this.lock(tx, principal, id);
            const transition = (0, request_status_1.findTransition)(current.status, 'submit');
            if (!transition || !(0, request_status_1.canActorRun)(transition, 'PAT', current.status)) {
                throw new common_1.HttpException({ code: 'INVALID_TRANSITION' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            }
            if (current.required_by.getTime() <= Date.now()) {
                throw new common_1.HttpException({ code: 'REQUIRED_BY_IN_PAST' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            }
            await tx.query(`UPDATE req.blood_request
            SET status = 'Submitted', submitted_at = now(),
                reference_no = 'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0'),
                version = version + 1, updated_at = now()
          WHERE id = $1`, [id]);
            await this.afterChange(tx, principal, id, current.status, 'Submitted', 'RequestSubmitted');
            const flags = await (0, request_flags_1.detectFlags)(tx, id);
            if (flags.length > 0)
                await this.outbox.append(tx, { aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestFlagged', payload: { flags } });
            return this.getOwned(tx, principal, id);
        });
    }
    async cancel(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const current = await this.lock(tx, principal, id);
            const transition = (0, request_status_1.findTransition)(current.status, 'cancel');
            if (!transition || !(0, request_status_1.canActorRun)(transition, 'PAT', current.status)) {
                throw new common_1.HttpException({ code: 'INVALID_TRANSITION' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            }
            await tx.query(`UPDATE req.blood_request SET status = 'Cancelled', cancel_reason = $2, version = version + 1, updated_at = now() WHERE id = $1`, [id, dto.reason]);
            await this.afterChange(tx, principal, id, current.status, 'Cancelled', 'RequestCancelled', dto.reason);
            return this.getOwned(tx, principal, id);
        });
    }
    async supplyInformation(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const current = await this.lock(tx, principal, id);
            const transition = (0, request_status_1.findTransition)(current.status, 'supply_information');
            if (!transition || !(0, request_status_1.canActorRun)(transition, 'PAT', current.status)) {
                throw new common_1.HttpException({ code: 'INVALID_TRANSITION' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            }
            await tx.query(`UPDATE req.blood_request SET status = 'Under review', version = version + 1, updated_at = now() WHERE id = $1`, [id]);
            await this.history.record(tx, {
                entityType: 'BLOOD_REQUEST', entityId: id, from: current.status, to: 'Under review', actorUserId: principal.userId,
                actorRole: 'PAT', source: 'USER', contextRequestId: id, reasonCode: 'INFORMATION_SUPPLIED', reason: dto.message,
                correlationId: (0, node_crypto_1.randomUUID)(),
            }, request_status_1.requestStateMachine);
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestInformationSupplied', payload: {}, version: current.version + 1,
            });
            return this.getOwned(tx, principal, id);
        });
    }
    async timeline(principal, id) {
        await this.getOwned(this.db, principal, id);
        const { rows } = await this.db.query(`SELECT occurred_at, from_status, to_status, reason_code, reason, details FROM aud.status_history
        WHERE entity_type = 'BLOOD_REQUEST' AND entity_id = $1 ORDER BY occurred_at, id`, [id]);
        return rows.map((r) => ({
            at: r.occurred_at, from: r.from_status, to: r.to_status, reasonCode: r.reason_code, reason: r.reason,
            missingItems: r.details?.missingItems ?? undefined,
        }));
    }
    async afterChange(tx, principal, id, from, to, event, reasonCode) {
        await this.history.record(tx, {
            entityType: 'BLOOD_REQUEST', entityId: id, from, to, actorUserId: principal.userId, actorRole: 'PAT', source: 'USER',
            contextRequestId: id, reasonCode, correlationId: (0, node_crypto_1.randomUUID)(),
        }, request_status_1.requestStateMachine);
        await this.outbox.append(tx, { aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: event, payload: { from, to } });
    }
    async lock(tx, principal, id) {
        const { rows } = await tx.query(`SELECT ${COLUMNS} FROM req.blood_request r WHERE r.id = $2 AND ${OWNED} FOR UPDATE OF r`, [principal.userId, id]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        const decision = this.policy.decide(principal, 'blood_request.edit', { resource: { ownerUserId: principal.userId } });
        if (!decision.allowed)
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
        return rows[0];
    }
    async getOwned(db, principal, id) {
        const { rows } = await db.query(`SELECT ${COLUMNS} FROM req.blood_request r WHERE r.id = $2 AND ${OWNED}`, [
            principal.userId,
            id,
        ]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        return toRequestView(rows[0]);
    }
};
exports.RequestService = RequestService;
exports.RequestService = RequestService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        policy_service_1.PolicyService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService])
], RequestService);
//# sourceMappingURL=request.service.js.map