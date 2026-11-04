import { ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { AuditService } from '../../platform/audit/audit.service';
import { facilityNames, FacilityName } from '../appointments/read-model.public';
import { latestOutcomeConfidence } from '../case-workflow/read-model.public';
import { normalizeBdPhone } from '../identity/identity.public';
import { searchCountsForRequest } from '../matching/read-model.public';
import { ChangeableFields, planRequestChanges, ProposedFields, UPDATABLE_STATUSES } from './request-changes';
import { detectFlags } from './request-flags';
import { RequestStatus, canActorRun, findTransition, requestStateMachine } from './request-status';
import { CancelRequestDto, CreatePatientDto, CreateRequestDto, SupplyInformationDto, UpdateRequestDto, UrgentProblemDto } from './request.dto';
import { RequestViewDto } from './request-view.dto';
import { bloodRequest, patient, representativeLink, requestChange } from './schema';

const requestColumns = {
  id: bloodRequest.id, referenceNo: bloodRequest.referenceNo, patientId: bloodRequest.patientId, requestedBloodGroup: bloodRequest.requestedBloodGroup,
  component: bloodRequest.component, quantityUnits: bloodRequest.quantityUnits, requiredBy: bloodRequest.requiredBy, urgency: bloodRequest.urgency,
  status: bloodRequest.status, outreachPaused: bloodRequest.outreachPaused, fulfilledQuantityUnits: bloodRequest.fulfilledQuantityUnits,
  cancelReason: bloodRequest.cancelReason, submittedAt: bloodRequest.submittedAt, verifiedAt: bloodRequest.verifiedAt, firstInvitedAt: bloodRequest.firstInvitedAt,
  firstWillingAt: bloodRequest.firstWillingAt, outcomeConfirmedAt: bloodRequest.outcomeConfirmedAt, fulfilledAt: bloodRequest.fulfilledAt,
  createdAt: bloodRequest.createdAt, version: bloodRequest.version, contactPhone: bloodRequest.contactPhone, altContactPhone: bloodRequest.altContactPhone,
  specialInstructions: bloodRequest.specialInstructions, hospitalFacilityId: bloodRequest.hospitalFacilityId, collectionFacilityId: bloodRequest.collectionFacilityId,
  searchWaveCount: bloodRequest.searchWaveCount, priority: bloodRequest.priority, donationReportedAt: bloodRequest.donationReportedAt, updatedAt: bloodRequest.updatedAt,
};

const ACTIVE_FOR_URGENT: RequestStatus[] = ['Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination', 'Awaiting outcome'];

type RequestRow = Omit<Pick<typeof bloodRequest.$inferSelect, keyof typeof requestColumns>, 'status'> & { status: RequestStatus };

export interface ViewExtras {
  patientName: string;
  patientRef: string | null;
  hospital: FacilityName | null;
  collectionDestination: FacilityName | null;
  outcomeConfidence: string | null;
}

export function toRequestView(row: RequestRow, extras: ViewExtras): RequestViewDto {
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
  id: requestChange.id, changeType: requestChange.changeType, isMaterial: requestChange.isMaterial, status: requestChange.status,
  proposedValues: requestChange.proposedValues, previousValues: requestChange.previousValues, createdAt: requestChange.createdAt,
};

function proposedFrom(dto: UpdateRequestDto): ProposedFields {
  const proposed: ProposedFields = {};
  if (dto.contactPhone !== undefined) {
    const phone = normalizeBdPhone(dto.contactPhone);
    if (!phone) throw new HttpException({ code: 'INVALID_PHONE' }, HttpStatus.BAD_REQUEST);
    proposed.contactPhone = phone;
  }
  if (dto.altContactPhone !== undefined) {
    const blank = !dto.altContactPhone.trim();
    const phone = blank ? null : normalizeBdPhone(dto.altContactPhone);
    if (!blank && !phone) throw new HttpException({ code: 'INVALID_PHONE' }, HttpStatus.BAD_REQUEST);
    proposed.altContactPhone = phone;
  }
  if (dto.requiredBy !== undefined) {
    const requiredBy = new Date(dto.requiredBy);
    if (requiredBy.getTime() <= Date.now()) throw new HttpException({ code: 'REQUIRED_BY_IN_PAST' }, HttpStatus.UNPROCESSABLE_ENTITY);
    proposed.requiredBy = requiredBy;
  }
  if (dto.specialInstructions !== undefined) proposed.specialInstructions = dto.specialInstructions.trim() || null;
  for (const field of ['quantityUnits', 'urgency', 'hospitalFacilityId', 'collectionFacilityId', 'requestedBloodGroup', 'component'] as const) {
    if (dto[field] !== undefined) Object.assign(proposed, { [field]: dto[field] });
  }
  return proposed;
}

@Injectable()
export class RequestService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async createPatient(principal: Principal, dto: CreatePatientDto) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.orm
        .insert(patient)
        .values({ displayName: dto.displayName, yearOfBirth: dto.yearOfBirth ?? null, hospitalPatientRef: dto.hospitalPatientRef ?? null, createdByUserId: principal.userId })
        .returning({ id: patient.id });
      const [link] = await tx.orm
        .insert(representativeLink)
        .values({ userId: principal.userId, patientId: created.id, relationship: dto.relationship, authorized: true, isPrimary: true, status: 'Active' })
        .returning({ id: representativeLink.id });
      await this.outbox.append(tx, {
        aggregateType: 'PATIENT', aggregateId: created.id, eventType: 'PatientRegistered', payload: { linkId: link.id },
      });
      return { id: created.id, displayName: dto.displayName, relationship: dto.relationship };
    });
  }

  async listPatients(principal: Principal) {
    return this.db.orm
      .select({ id: patient.id, displayName: patient.displayName, relationship: representativeLink.relationship, hospitalPatientRef: patient.hospitalPatientRef })
      .from(representativeLink)
      .innerJoin(patient, eq(patient.id, representativeLink.patientId))
      .where(and(eq(representativeLink.userId, principal.userId), eq(representativeLink.status, 'Active'), isNull(patient.deletedAt)))
      .orderBy(asc(patient.createdAt));
  }

  async createRequest(principal: Principal, dto: CreateRequestDto) {
    const requiredBy = new Date(dto.requiredBy);
    if (requiredBy.getTime() <= Date.now()) throw new HttpException({ code: 'REQUIRED_BY_IN_PAST' }, HttpStatus.UNPROCESSABLE_ENTITY);
    const contact = normalizeBdPhone(dto.contactPhone);
    if (!contact) throw new HttpException({ code: 'INVALID_PHONE' }, HttpStatus.BAD_REQUEST);
    const alt = dto.altContactPhone ? normalizeBdPhone(dto.altContactPhone) : null;
    if (dto.altContactPhone && !alt) throw new HttpException({ code: 'INVALID_PHONE' }, HttpStatus.BAD_REQUEST);

    return this.db.transaction(async (tx) => {
      const [link] = await tx.orm
        .select({ id: representativeLink.id })
        .from(representativeLink)
        .where(and(eq(representativeLink.userId, principal.userId), eq(representativeLink.patientId, dto.patientId), eq(representativeLink.status, 'Active'), eq(representativeLink.authorized, true)));
      if (!link) throw new NotFoundException({ code: 'PATIENT_NOT_FOUND' });

      const inserted = await tx.orm
        .insert(bloodRequest)
        .values({
          patientId: dto.patientId, representativeLinkId: link.id, createdByUserId: principal.userId, contactPhone: contact, altContactPhone: alt,
          hospitalFacilityId: dto.hospitalFacilityId ?? null, collectionFacilityId: dto.collectionFacilityId ?? null, areaId: dto.areaId ?? null, requestedBloodGroup: dto.requestedBloodGroup, component: dto.component,
          quantityUnits: dto.quantityUnits, requiredBy, urgency: dto.urgency, specialInstructions: dto.specialInstructions ?? null,
          preferredSupportContact: dto.preferredSupportContact ?? null, clientMutationId: dto.clientMutationId ?? null,
        })
        .onConflictDoNothing({ target: [bloodRequest.createdByUserId, bloodRequest.clientMutationId], where: sql`client_mutation_id is not null` })
        .returning({ id: bloodRequest.id });
      let id = inserted[0]?.id;
      if (!id) {
        const [existing] = await tx.orm
          .select({ id: bloodRequest.id })
          .from(bloodRequest)
          .where(and(eq(bloodRequest.createdByUserId, principal.userId), eq(bloodRequest.clientMutationId, dto.clientMutationId!)));
        id = existing.id;
      } else {
        await this.history.record(tx, {
          entityType: 'BLOOD_REQUEST', entityId: id, from: null, to: 'Draft', actorUserId: principal.userId,
          actorRole: 'PAT', source: 'USER', contextRequestId: id, correlationId: randomUUID(),
        });
      }
      return this.getOwned(tx, principal, id);
    });
  }

  async listRequests(principal: Principal) {
    const rows = await this.db.orm.select(requestColumns).from(bloodRequest).where(this.owned(principal)).orderBy(desc(bloodRequest.createdAt)).limit(100);
    return this.views(this.db, rows as RequestRow[]);
  }

  async getRequest(principal: Principal, id: string) {
    return this.getOwned(this.db, principal, id);
  }

  async submit(principal: Principal, id: string) {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, principal, id);
      const transition = findTransition(current.status, 'submit');
      if (!transition || !canActorRun(transition, 'PAT', current.status)) {
        throw new HttpException({ code: 'INVALID_TRANSITION' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      if (current.requiredBy.getTime() <= Date.now()) {
        throw new HttpException({ code: 'REQUIRED_BY_IN_PAST' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      await tx.orm
        .update(bloodRequest)
        .set({
          status: 'Submitted', submittedAt: new Date(),
          referenceNo: sql`'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0')`,
          version: sql`${bloodRequest.version} + 1`, updatedAt: new Date(),
        })
        .where(eq(bloodRequest.id, id));
      await this.afterChange(tx, principal, id, current.status, 'Submitted', 'RequestSubmitted');
      const flags = await detectFlags(tx, id);
      if (flags.length > 0) await this.outbox.append(tx, { aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestFlagged', payload: { flags } });
      return this.getOwned(tx, principal, id);
    });
  }

  async cancel(principal: Principal, id: string, dto: CancelRequestDto) {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, principal, id);
      const transition = findTransition(current.status, 'cancel');
      if (!transition || !canActorRun(transition, 'PAT', current.status)) {
        throw new HttpException({ code: 'INVALID_TRANSITION' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      await tx.orm
        .update(bloodRequest)
        .set({ status: 'Cancelled', cancelReason: dto.reason, version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() })
        .where(eq(bloodRequest.id, id));
      await this.afterChange(tx, principal, id, current.status, 'Cancelled', 'RequestCancelled', dto.reason);
      return this.getOwned(tx, principal, id);
    });
  }

  async supplyInformation(principal: Principal, id: string, dto: SupplyInformationDto) {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, principal, id);
      const transition = findTransition(current.status, 'supply_information');
      if (!transition || !canActorRun(transition, 'PAT', current.status)) {
        throw new HttpException({ code: 'INVALID_TRANSITION' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      await tx.orm.update(bloodRequest).set({ status: 'Under review', version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() }).where(eq(bloodRequest.id, id));
      await this.history.record(
        tx,
        {
          entityType: 'BLOOD_REQUEST', entityId: id, from: current.status, to: 'Under review', actorUserId: principal.userId,
          actorRole: 'PAT', source: 'USER', contextRequestId: id, reasonCode: 'INFORMATION_SUPPLIED', reason: dto.message,
          correlationId: randomUUID(),
        },
        requestStateMachine,
      );
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'RequestInformationSupplied', payload: {}, version: current.version + 1,
      });
      return this.getOwned(tx, principal, id);
    });
  }

  async progress(principal: Principal, id: string) {
    const [row] = await this.db.orm
      .select({ searchWaveCount: bloodRequest.searchWaveCount })
      .from(bloodRequest)
      .where(and(eq(bloodRequest.id, id), this.owned(principal)));
    if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    const counts = await searchCountsForRequest(this.db, id);
    return { ...counts, searchWave: row.searchWaveCount };
  }

  async listChanges(principal: Principal, id: string) {
    await this.getOwned(this.db, principal, id);
    return this.db.orm
      .select(changeColumns)
      .from(requestChange)
      .where(eq(requestChange.requestId, id))
      .orderBy(desc(requestChange.createdAt));
  }

  async updateRequest(principal: Principal, id: string, dto: UpdateRequestDto) {
    const proposed = proposedFrom(dto);
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, principal, id);
      if (!UPDATABLE_STATUSES.includes(current.status)) throw new HttpException({ code: 'UPDATE_NOT_ALLOWED' }, HttpStatus.UNPROCESSABLE_ENTITY);
      const plan = planRequestChanges(current.status, current as ChangeableFields, proposed);
      if (plan.length === 0) throw new HttpException({ code: 'NO_CHANGES' }, HttpStatus.UNPROCESSABLE_ENTITY);

      const materialTypes = plan.filter((c) => c.material).map((c) => c.type);
      if (materialTypes.length > 0) {
        const [pending] = await tx.orm
          .select({ id: requestChange.id })
          .from(requestChange)
          .where(and(eq(requestChange.requestId, id), eq(requestChange.status, 'Pending'), inArray(requestChange.changeType, materialTypes)))
          .limit(1);
        if (pending) throw new ConflictException({ code: 'CHANGE_PENDING' });
      }

      const applied = Object.assign({}, ...plan.filter((c) => !c.material).map((c) => c.proposed)) as ProposedFields;
      await tx.orm
        .update(bloodRequest)
        .set({ ...(applied as Partial<typeof bloodRequest.$inferInsert>), version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() })
        .where(eq(bloodRequest.id, id));

      const correlationId = randomUUID();
      const changes = [];
      for (const change of plan) {
        const status = change.material ? 'Pending' : 'Auto-applied';
        const [created] = await tx.orm
          .insert(requestChange)
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

  async reportUrgentProblem(principal: Principal, id: string, dto: UrgentProblemDto) {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, principal, id);
      if (!ACTIVE_FOR_URGENT.includes(current.status)) throw new HttpException({ code: 'URGENT_PROBLEM_NOT_ALLOWED' }, HttpStatus.UNPROCESSABLE_ENTITY);
      const to = current.priority === 'Normal' ? 'High' : 'Critical';
      await tx.orm.update(bloodRequest).set({ priority: to, version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() }).where(eq(bloodRequest.id, id));
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'URGENT_PROBLEM_REPORTED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'PAT',
        entityType: 'BLOOD_REQUEST', entityId: id, contextRequestId: id, changes: { priority: { from: current.priority, to } }, correlationId: randomUUID(),
      });
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: 'UrgentProblemReported', payload: { priority: to, note: dto.note ?? null },
        version: current.version + 1,
      });
      return this.getOwned(tx, principal, id);
    });
  }

  async timeline(principal: Principal, id: string) {
    await this.getOwned(this.db, principal, id);
    const { rows } = await this.db.query<{ occurred_at: Date; from_status: string | null; to_status: string; actor_role: string; reason_code: string | null; reason: string | null; details: { missingItems?: string[] } | null }>(
      `SELECT occurred_at, from_status, to_status, actor_role, reason_code, reason, details FROM aud.status_history
        WHERE entity_type = 'BLOOD_REQUEST' AND entity_id = $1 ORDER BY occurred_at, id`,
      [id],
    );
    return rows.map((r) => ({
      at: r.occurred_at, from: r.from_status, to: r.to_status, actorRole: r.actor_role, reasonCode: r.reason_code, reason: r.reason,
      missingItems: r.details?.missingItems ?? undefined,
    }));
  }

  private owned(principal: Principal) {
    return or(
      eq(bloodRequest.createdByUserId, principal.userId),
      exists(
        this.db.orm
          .select({ one: sql`1` })
          .from(representativeLink)
          .where(and(eq(representativeLink.id, bloodRequest.representativeLinkId), eq(representativeLink.userId, principal.userId), eq(representativeLink.status, 'Active'), eq(representativeLink.authorized, true))),
      ),
    );
  }

  private async afterChange(tx: Db, principal: Principal, id: string, from: RequestStatus, to: RequestStatus, event: string, reasonCode?: string) {
    await this.history.record(
      tx,
      {
        entityType: 'BLOOD_REQUEST', entityId: id, from, to, actorUserId: principal.userId, actorRole: 'PAT', source: 'USER',
        contextRequestId: id, reasonCode, correlationId: randomUUID(),
      },
      requestStateMachine,
    );
    await this.outbox.append(tx, { aggregateType: 'BLOOD_REQUEST', aggregateId: id, eventType: event, payload: { from, to } });
  }

  private async lock(tx: Db, principal: Principal, id: string): Promise<RequestRow> {
    const [row] = await tx.orm.select(requestColumns).from(bloodRequest).where(and(eq(bloodRequest.id, id), this.owned(principal))).for('update');
    if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    const decision = this.policy.decide(principal, 'blood_request.edit', { resource: { ownerUserId: principal.userId } });
    if (!decision.allowed) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    return row as RequestRow;
  }

  private async getOwned(db: Db, principal: Principal, id: string) {
    const [row] = await db.orm.select(requestColumns).from(bloodRequest).where(and(eq(bloodRequest.id, id), this.owned(principal)));
    if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    const [view] = await this.views(db, [row as RequestRow]);
    return view;
  }

  private async views(db: Db, rows: RequestRow[]): Promise<RequestViewDto[]> {
    if (rows.length === 0) return [];
    const patientIds = [...new Set(rows.map((r) => r.patientId))];
    const patients = await db.orm
      .select({ id: patient.id, displayName: patient.displayName, hospitalPatientRef: patient.hospitalPatientRef })
      .from(patient)
      .where(inArray(patient.id, patientIds));
    const byPatient = new Map(patients.map((p) => [p.id, p]));
    const facilityIds = rows.flatMap((r) => [r.hospitalFacilityId, r.collectionFacilityId]).filter((v): v is string => !!v);
    const facilities = await facilityNames(db, facilityIds);
    const outcomes = await latestOutcomeConfidence(db, rows.map((r) => r.id));
    return rows.map((row) =>
      toRequestView(row, {
        patientName: byPatient.get(row.patientId)?.displayName ?? '',
        patientRef: byPatient.get(row.patientId)?.hospitalPatientRef ?? null,
        hospital: row.hospitalFacilityId ? (facilities.get(row.hospitalFacilityId) ?? null) : null,
        collectionDestination: row.collectionFacilityId ? (facilities.get(row.collectionFacilityId) ?? null) : null,
        outcomeConfidence: outcomes.get(row.id) ?? null,
      }),
    );
  }
}
