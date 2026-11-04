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
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const policy_service_1 = require("../../platform/policy/policy.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const audit_service_1 = require("../../platform/audit/audit.service");
const read_model_public_1 = require("../appointments/read-model.public");
const read_model_public_2 = require("../case-workflow/read-model.public");
const identity_public_1 = require("../identity/identity.public");
const read_model_public_3 = require("../matching/read-model.public");
const request_changes_1 = require("./request-changes");
const request_flags_1 = require("./request-flags");
const request_status_1 = require("./request-status");
const schema_1 = require("./schema");
const requestColumns = {
    id: schema_1.bloodRequest.id, referenceNo: schema_1.bloodRequest.referenceNo, patientId: schema_1.bloodRequest.patientId, requestedBloodGroup: schema_1.bloodRequest.requestedBloodGroup,
    component: schema_1.bloodRequest.component, quantityUnits: schema_1.bloodRequest.quantityUnits, requiredBy: schema_1.bloodRequest.requiredBy, urgency: schema_1.bloodRequest.urgency,
    status: schema_1.bloodRequest.status, outreachPaused: schema_1.bloodRequest.outreachPaused, fulfilledQuantityUnits: schema_1.bloodRequest.fulfilledQuantityUnits,
    cancelReason: schema_1.bloodRequest.cancelReason, submittedAt: schema_1.bloodRequest.submittedAt, verifiedAt: schema_1.bloodRequest.verifiedAt, firstInvitedAt: schema_1.bloodRequest.firstInvitedAt,
    firstWillingAt: schema_1.bloodRequest.firstWillingAt, outcomeConfirmedAt: schema_1.bloodRequest.outcomeConfirmedAt, fulfilledAt: schema_1.bloodRequest.fulfilledAt,
    createdAt: schema_1.bloodRequest.createdAt, version: schema_1.bloodRequest.version, contactPhone: schema_1.bloodRequest.contactPhone, altContactPhone: schema_1.bloodRequest.altContactPhone,
    specialInstructions: schema_1.bloodRequest.specialInstructions, hospitalFacilityId: schema_1.bloodRequest.hospitalFacilityId, collectionFacilityId: schema_1.bloodRequest.collectionFacilityId,
    searchWaveCount: schema_1.bloodRequest.searchWaveCount, priority: schema_1.bloodRequest.priority, donationReportedAt: schema_1.bloodRequest.donationReportedAt, updatedAt: schema_1.bloodRequest.updatedAt,
};
const ACTIVE_FOR_URGENT = ['Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination', 'Awaiting outcome'];
function toRequestView(row, extras) {
    return {
        id: row.id,
        referenceNo: row.referenceNo,
        patientId: row.patientId,
        ...extras,
        requestedBloodGroup: row.requestedBloodGroup,
        component: row.component,
        quantityUnits: row.quantityUnits,
        requiredBy: row.requiredBy,
        urgency: row.urgency,
        priority: row.priority,
        status: row.status,
        outreachPaused: row.outreachPaused,
        cancelReason: row.cancelReason,
        contactPhone: row.contactPhone,
        altContactPhone: row.altContactPhone,
        specialInstructions: row.specialInstructions,
        hospitalFacilityId: row.hospitalFacilityId,
        collectionFacilityId: row.collectionFacilityId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
        milestones: {
            submittedAt: row.submittedAt,
            verifiedAt: row.verifiedAt,
            searchStartedAt: row.firstInvitedAt,
            donorWillingAt: row.firstWillingAt,
            donationReportedAt: row.donationReportedAt,
            outcomeConfirmedAt: row.outcomeConfirmedAt,
            fulfilledAt: row.fulfilledAt,
        },
    };
}
const changeColumns = {
    id: schema_1.requestChange.id, changeType: schema_1.requestChange.changeType, isMaterial: schema_1.requestChange.isMaterial, status: schema_1.requestChange.status,
    proposedValues: schema_1.requestChange.proposedValues, previousValues: schema_1.requestChange.previousValues, createdAt: schema_1.requestChange.createdAt,
};
function proposedFrom(dto) {
    const proposed = {};
    if (dto.contactPhone !== undefined) {
        const phone = (0, identity_public_1.normalizeBdPhone)(dto.contactPhone);
        if (!phone)
            throw new common_1.HttpException({ code: 'INVALID_PHONE' }, common_1.HttpStatus.BAD_REQUEST);
        proposed.contactPhone = phone;
    }
    if (dto.altContactPhone !== undefined) {
        const blank = !dto.altContactPhone.trim();
        const phone = blank ? null : (0, identity_public_1.normalizeBdPhone)(dto.altContactPhone);
        if (!blank && !phone)
            throw new common_1.HttpException({ code: 'INVALID_PHONE' }, common_1.HttpStatus.BAD_REQUEST);
        proposed.altContactPhone = phone;
    }
    if (dto.requiredBy !== undefined) {
        const requiredBy = new Date(dto.requiredBy);
        if (requiredBy.getTime() <= Date.now())
            throw new common_1.HttpException({ code: 'REQUIRED_BY_IN_PAST' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
        proposed.requiredBy = requiredBy;
    }
    if (dto.specialInstructions !== undefined)
        proposed.specialInstructions = dto.specialInstructions.trim() || null;
    for (const field of ['quantityUnits', 'urgency', 'hospitalFacilityId', 'collectionFacilityId', 'requestedBloodGroup', 'component']) {
        if (dto[field] !== undefined)
            Object.assign(proposed, { [field]: dto[field] });
    }
    return proposed;
}
let RequestService = class RequestService {
    db;
    policy;
    history;
    outbox;
    audit;
    constructor(db, policy, history, outbox, audit) {
        this.db = db;
        this.policy = policy;
        this.history = history;
        this.outbox = outbox;
        this.audit = audit;
    }
    async createPatient(principal, dto) {
        return this.db.transaction(async (tx) => {
            const [created] = await tx.orm
                .insert(schema_1.patient)
                .values({ displayName: dto.displayName, yearOfBirth: dto.yearOfBirth ?? null, hospitalPatientRef: dto.hospitalPatientRef ?? null, createdByUserId: principal.userId })
                .returning({ id: schema_1.patient.id });
            const [link] = await tx.orm
                .insert(schema_1.representativeLink)
                .values({ userId: principal.userId, patientId: created.id, relationship: dto.relationship, authorized: true, isPrimary: true, status: 'Active' })
                .returning({ id: schema_1.representativeLink.id });
            await this.outbox.append(tx, {
                aggregateType: 'PATIENT', aggregateId: created.id, eventType: 'PatientRegistered', payload: { linkId: link.id },
            });
            return { id: created.id, displayName: dto.displayName, relationship: dto.relationship };
        });
    }
    async listPatients(principal) {
        return this.db.orm
            .select({ id: schema_1.patient.id, displayName: schema_1.patient.displayName, relationship: schema_1.representativeLink.relationship, hospitalPatientRef: schema_1.patient.hospitalPatientRef })
            .from(schema_1.representativeLink)
            .innerJoin(schema_1.patient, (0, drizzle_orm_1.eq)(schema_1.patient.id, schema_1.representativeLink.patientId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.representativeLink.userId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.representativeLink.status, 'Active'), (0, drizzle_orm_1.isNull)(schema_1.patient.deletedAt)))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.patient.createdAt));
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
            const [link] = await tx.orm
                .select({ id: schema_1.representativeLink.id })
                .from(schema_1.representativeLink)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.representativeLink.userId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.representativeLink.patientId, dto.patientId), (0, drizzle_orm_1.eq)(schema_1.representativeLink.status, 'Active'), (0, drizzle_orm_1.eq)(schema_1.representativeLink.authorized, true)));
            if (!link)
                throw new common_1.NotFoundException({ code: 'PATIENT_NOT_FOUND' });
            const inserted = await tx.orm
                .insert(schema_1.bloodRequest)
                .values({
                patientId: dto.patientId, representativeLinkId: link.id, createdByUserId: principal.userId, contactPhone: contact, altContactPhone: alt,
                hospitalFacilityId: dto.hospitalFacilityId ?? null, collectionFacilityId: dto.collectionFacilityId ?? null, areaId: dto.areaId ?? null, requestedBloodGroup: dto.requestedBloodGroup, component: dto.component,
                quantityUnits: dto.quantityUnits, requiredBy, urgency: dto.urgency, specialInstructions: dto.specialInstructions ?? null,
                preferredSupportContact: dto.preferredSupportContact ?? null, clientMutationId: dto.clientMutationId ?? null,
            })
                .onConflictDoNothing({ target: [schema_1.bloodRequest.createdByUserId, schema_1.bloodRequest.clientMutationId], where: (0, drizzle_orm_1.sql) `client_mutation_id is not null` })
                .returning({ id: schema_1.bloodRequest.id });
            let id = inserted[0]?.id;
            if (!id) {
                const [existing] = await tx.orm
                    .select({ id: schema_1.bloodRequest.id })
                    .from(schema_1.bloodRequest)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.createdByUserId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.bloodRequest.clientMutationId, dto.clientMutationId)));
                id = existing.id;
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
        const rows = await this.db.orm.select(requestColumns).from(schema_1.bloodRequest).where(this.owned(principal)).orderBy((0, drizzle_orm_1.desc)(schema_1.bloodRequest.createdAt)).limit(100);
        return this.views(this.db, rows);
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
            if (current.requiredBy.getTime() <= Date.now()) {
                throw new common_1.HttpException({ code: 'REQUIRED_BY_IN_PAST' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            }
            await tx.orm
                .update(schema_1.bloodRequest)
                .set({
                status: 'Submitted', submittedAt: new Date(),
                referenceNo: (0, drizzle_orm_1.sql) `'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0')`,
                version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
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
            await tx.orm
                .update(schema_1.bloodRequest)
                .set({ status: 'Cancelled', cancelReason: dto.reason, version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
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
            await tx.orm.update(schema_1.bloodRequest).set({ status: 'Under review', version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
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
    async progress(principal, id) {
        const [row] = await this.db.orm
            .select({ searchWaveCount: schema_1.bloodRequest.searchWaveCount })
            .from(schema_1.bloodRequest)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id), this.owned(principal)));
        if (!row)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        const counts = await (0, read_model_public_3.searchCountsForRequest)(this.db, id);
        return { ...counts, searchWave: row.searchWaveCount };
    }
    async listChanges(principal, id) {
        await this.getOwned(this.db, principal, id);
        return this.db.orm
            .select(changeColumns)
            .from(schema_1.requestChange)
            .where((0, drizzle_orm_1.eq)(schema_1.requestChange.requestId, id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.requestChange.createdAt));
    }
    async updateRequest(principal, id, dto) {
        const proposed = proposedFrom(dto);
        return this.db.transaction(async (tx) => {
            const current = await this.lock(tx, principal, id);
            if (!request_changes_1.UPDATABLE_STATUSES.includes(current.status))
                throw new common_1.HttpException({ code: 'UPDATE_NOT_ALLOWED' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            const plan = (0, request_changes_1.planRequestChanges)(current.status, current, proposed);
            if (plan.length === 0)
                throw new common_1.HttpException({ code: 'NO_CHANGES' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            const materialTypes = plan.filter((c) => c.material).map((c) => c.type);
            if (materialTypes.length > 0) {
                const [pending] = await tx.orm
                    .select({ id: schema_1.requestChange.id })
                    .from(schema_1.requestChange)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requestChange.requestId, id), (0, drizzle_orm_1.eq)(schema_1.requestChange.status, 'Pending'), (0, drizzle_orm_1.inArray)(schema_1.requestChange.changeType, materialTypes)))
                    .limit(1);
                if (pending)
                    throw new common_1.ConflictException({ code: 'CHANGE_PENDING' });
            }
            const applied = Object.assign({}, ...plan.filter((c) => !c.material).map((c) => c.proposed));
            await tx.orm
                .update(schema_1.bloodRequest)
                .set({ ...applied, version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            const correlationId = (0, node_crypto_1.randomUUID)();
            const changes = [];
            for (const change of plan) {
                const status = change.material ? 'Pending' : 'Auto-applied';
                const [created] = await tx.orm
                    .insert(schema_1.requestChange)
                    .values({
                    requestId: id, requestedBy: principal.userId, changeType: change.type, proposedValues: change.proposed, previousValues: change.previous,
                    isMaterial: change.material, status,
                })
                    .returning(changeColumns);
                await this.history.record(tx, {
                    entityType: 'REQUEST_CHANGE', entityId: created.id, from: null, to: status, actorUserId: principal.userId, actorRole: 'PAT',
                    source: 'USER', contextRequestId: id, reasonCode: change.type, correlationId,
                });
                changes.push(created);
            }
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestChanged',
                payload: { changeIds: changes.map((c) => c.id), types: plan.map((c) => c.type), material: materialTypes.length > 0 },
                version: current.version + 1,
            });
            return { request: await this.getOwned(tx, principal, id), changes };
        });
    }
    async reportUrgentProblem(principal, id, dto) {
        return this.db.transaction(async (tx) => {
            const current = await this.lock(tx, principal, id);
            if (!ACTIVE_FOR_URGENT.includes(current.status))
                throw new common_1.HttpException({ code: 'URGENT_PROBLEM_NOT_ALLOWED' }, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            const to = current.priority === 'Normal' ? 'High' : 'Critical';
            await tx.orm.update(schema_1.bloodRequest).set({ priority: to, version: (0, drizzle_orm_1.sql) `${schema_1.bloodRequest.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id));
            await this.audit.record(tx, {
                category: 'DATA_CHANGE', action: 'URGENT_PROBLEM_REPORTED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'PAT',
                entityType: 'BLOOD_REQUEST', entityId: id, contextRequestId: id, changes: { priority: { from: current.priority, to } }, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            await this.outbox.append(tx, {
                aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'UrgentProblemReported', payload: { priority: to, note: dto.note ?? null },
                version: current.version + 1,
            });
            return this.getOwned(tx, principal, id);
        });
    }
    async timeline(principal, id) {
        await this.getOwned(this.db, principal, id);
        const { rows } = await this.db.query(`SELECT occurred_at, from_status, to_status, actor_role, reason_code, reason, details FROM aud.status_history
        WHERE entity_type = 'BLOOD_REQUEST' AND entity_id = $1 ORDER BY occurred_at, id`, [id]);
        return rows.map((r) => ({
            at: r.occurred_at, from: r.from_status, to: r.to_status, actorRole: r.actor_role, reasonCode: r.reason_code, reason: r.reason,
            missingItems: r.details?.missingItems ?? undefined,
        }));
    }
    owned(principal) {
        return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.createdByUserId, principal.userId), (0, drizzle_orm_1.exists)(this.db.orm
            .select({ one: (0, drizzle_orm_1.sql) `1` })
            .from(schema_1.representativeLink)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.representativeLink.id, schema_1.bloodRequest.representativeLinkId), (0, drizzle_orm_1.eq)(schema_1.representativeLink.userId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.representativeLink.status, 'Active'), (0, drizzle_orm_1.eq)(schema_1.representativeLink.authorized, true)))));
    }
    async afterChange(tx, principal, id, from, to, event, reasonCode) {
        await this.history.record(tx, {
            entityType: 'BLOOD_REQUEST', entityId: id, from, to, actorUserId: principal.userId, actorRole: 'PAT', source: 'USER',
            contextRequestId: id, reasonCode, correlationId: (0, node_crypto_1.randomUUID)(),
        }, request_status_1.requestStateMachine);
        await this.outbox.append(tx, { aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: event, payload: { from, to } });
    }
    async lock(tx, principal, id) {
        const [row] = await tx.orm.select(requestColumns).from(schema_1.bloodRequest).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id), this.owned(principal))).for('update');
        if (!row)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        const decision = this.policy.decide(principal, 'blood_request.edit', { resource: { ownerUserId: principal.userId } });
        if (!decision.allowed)
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
        return row;
    }
    async getOwned(db, principal, id) {
        const [row] = await db.orm.select(requestColumns).from(schema_1.bloodRequest).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bloodRequest.id, id), this.owned(principal)));
        if (!row)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        const [view] = await this.views(db, [row]);
        return view;
    }
    async views(db, rows) {
        if (rows.length === 0)
            return [];
        const patientIds = [...new Set(rows.map((r) => r.patientId))];
        const patients = await db.orm
            .select({ id: schema_1.patient.id, displayName: schema_1.patient.displayName, hospitalPatientRef: schema_1.patient.hospitalPatientRef })
            .from(schema_1.patient)
            .where((0, drizzle_orm_1.inArray)(schema_1.patient.id, patientIds));
        const byPatient = new Map(patients.map((p) => [p.id, p]));
        const facilityIds = rows.flatMap((r) => [r.hospitalFacilityId, r.collectionFacilityId]).filter((v) => !!v);
        const facilities = await (0, read_model_public_1.facilityNames)(db, facilityIds);
        const outcomes = await (0, read_model_public_2.latestOutcomeConfidence)(db, rows.map((r) => r.id));
        return rows.map((row) => toRequestView(row, {
            patientName: byPatient.get(row.patientId)?.displayName ?? '',
            patientRef: byPatient.get(row.patientId)?.hospitalPatientRef ?? null,
            hospital: row.hospitalFacilityId ? (facilities.get(row.hospitalFacilityId) ?? null) : null,
            collectionDestination: row.collectionFacilityId ? (facilities.get(row.collectionFacilityId) ?? null) : null,
            outcomeConfidence: outcomes.get(row.id) ?? null,
        }));
    }
};
exports.RequestService = RequestService;
exports.RequestService = RequestService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        policy_service_1.PolicyService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService])
], RequestService);
//# sourceMappingURL=request.service.js.map