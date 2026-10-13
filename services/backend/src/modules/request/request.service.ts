import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { normalizeBdPhone } from '../identity/identity.public';
import { detectFlags } from './request-flags';
import { RequestStatus, canActorRun, findTransition, requestStateMachine } from './request-status';
import { CancelRequestDto, CreatePatientDto, CreateRequestDto, SupplyInformationDto } from './request.dto';

interface RequestRow {
  id: string;
  reference_no: string | null;
  patient_id: string;
  requested_blood_group: string;
  component: string;
  quantity_units: number;
  required_by: Date;
  urgency: string;
  status: RequestStatus;
  outreach_paused: boolean;
  fulfilled_quantity_units: number;
  cancel_reason: string | null;
  submitted_at: Date | null;
  verified_at: Date | null;
  first_invited_at: Date | null;
  first_willing_at: Date | null;
  outcome_confirmed_at: Date | null;
  fulfilled_at: Date | null;
  created_at: Date;
  version: number;
}

const COLUMNS = `r.id, r.reference_no, r.patient_id, r.requested_blood_group, r.component, r.quantity_units, r.required_by, r.urgency,
  r.status, r.outreach_paused, r.fulfilled_quantity_units, r.cancel_reason, r.submitted_at, r.verified_at, r.first_invited_at,
  r.first_willing_at, r.outcome_confirmed_at, r.fulfilled_at, r.created_at, r.version`;

const OWNED = `(r.created_by_user_id = $1 OR EXISTS (
  SELECT 1 FROM req.representative_link l
   WHERE l.id = r.representative_link_id AND l.user_id = $1 AND l.status = 'Active' AND l.authorized))`;

export function toRequestView(row: RequestRow) {
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

@Injectable()
export class RequestService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
  ) {}

  async createPatient(principal: Principal, dto: CreatePatientDto) {
    return this.db.transaction(async (tx) => {
      const patient = await tx.query<{ id: string }>(
        `INSERT INTO req.patient (display_name, year_of_birth, hospital_patient_ref, created_by_user_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [dto.displayName, dto.yearOfBirth ?? null, dto.hospitalPatientRef ?? null, principal.userId],
      );
      const patientId = patient.rows[0].id;
      const link = await tx.query<{ id: string }>(
        `INSERT INTO req.representative_link (user_id, patient_id, relationship, authorized, is_primary, status)
         VALUES ($1, $2, $3, true, true, 'Active') RETURNING id`,
        [principal.userId, patientId, dto.relationship],
      );
      await this.outbox.append(tx, {
        aggregateType: 'PATIENT', aggregateId: patientId, eventType: 'PatientRegistered', payload: { linkId: link.rows[0].id },
      });
      return { id: patientId, displayName: dto.displayName, relationship: dto.relationship };
    });
  }

  async listPatients(principal: Principal) {
    const { rows } = await this.db.query<{ id: string; display_name: string; relationship: string }>(
      `SELECT p.id, p.display_name, l.relationship
         FROM req.representative_link l JOIN req.patient p ON p.id = l.patient_id
        WHERE l.user_id = $1 AND l.status = 'Active' AND p.deleted_at IS NULL ORDER BY p.created_at`,
      [principal.userId],
    );
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, relationship: r.relationship }));
  }

  async createRequest(principal: Principal, dto: CreateRequestDto) {
    const requiredBy = new Date(dto.requiredBy);
    if (requiredBy.getTime() <= Date.now()) throw new HttpException({ code: 'REQUIRED_BY_IN_PAST' }, HttpStatus.UNPROCESSABLE_ENTITY);
    const contact = normalizeBdPhone(dto.contactPhone);
    if (!contact) throw new HttpException({ code: 'INVALID_PHONE' }, HttpStatus.BAD_REQUEST);
    const alt = dto.altContactPhone ? normalizeBdPhone(dto.altContactPhone) : null;
    if (dto.altContactPhone && !alt) throw new HttpException({ code: 'INVALID_PHONE' }, HttpStatus.BAD_REQUEST);

    return this.db.transaction(async (tx) => {
      const link = await tx.query<{ id: string }>(
        `SELECT id FROM req.representative_link
          WHERE user_id = $1 AND patient_id = $2 AND status = 'Active' AND authorized`,
        [principal.userId, dto.patientId],
      );
      if (!link.rows[0]) throw new NotFoundException({ code: 'PATIENT_NOT_FOUND' });

      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO req.blood_request
           (patient_id, representative_link_id, created_by_user_id, contact_phone, alt_contact_phone, hospital_facility_id, area_id,
            requested_blood_group, component, quantity_units, required_by, urgency, special_instructions,
            preferred_support_contact, client_mutation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (created_by_user_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          dto.patientId, link.rows[0].id, principal.userId, contact, alt, dto.hospitalFacilityId ?? null, dto.areaId ?? null,
          dto.requestedBloodGroup, dto.component, dto.quantityUnits, requiredBy, dto.urgency, dto.specialInstructions ?? null,
          dto.preferredSupportContact ?? null, dto.clientMutationId ?? null,
        ],
      );
      let id = inserted.rows[0]?.id;
      if (!id) {
        const existing = await tx.query<{ id: string }>(
          'SELECT id FROM req.blood_request WHERE created_by_user_id = $1 AND client_mutation_id = $2',
          [principal.userId, dto.clientMutationId],
        );
        id = existing.rows[0].id;
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
    const { rows } = await this.db.query<RequestRow>(
      `SELECT ${COLUMNS} FROM req.blood_request r WHERE ${OWNED} ORDER BY r.created_at DESC LIMIT 100`,
      [principal.userId],
    );
    return rows.map(toRequestView);
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
      if (current.required_by.getTime() <= Date.now()) {
        throw new HttpException({ code: 'REQUIRED_BY_IN_PAST' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      await tx.query(
        `UPDATE req.blood_request
            SET status = 'Submitted', submitted_at = now(),
                reference_no = 'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('req.blood_request_reference_seq')::text, 6, '0'),
                version = version + 1, updated_at = now()
          WHERE id = $1`,
        [id],
      );
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
      await tx.query(
        `UPDATE req.blood_request SET status = 'Cancelled', cancel_reason = $2, version = version + 1, updated_at = now() WHERE id = $1`,
        [id, dto.reason],
      );
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
      await tx.query(`UPDATE req.blood_request SET status = 'Under review', version = version + 1, updated_at = now() WHERE id = $1`, [id]);
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

  async timeline(principal: Principal, id: string) {
    await this.getOwned(this.db, principal, id);
    const { rows } = await this.db.query<{ occurred_at: Date; from_status: string | null; to_status: string; reason_code: string | null; reason: string | null; details: { missingItems?: string[] } | null }>(
      `SELECT occurred_at, from_status, to_status, reason_code, reason, details FROM aud.status_history
        WHERE entity_type = 'BLOOD_REQUEST' AND entity_id = $1 ORDER BY occurred_at, id`,
      [id],
    );
    return rows.map((r) => ({
      at: r.occurred_at, from: r.from_status, to: r.to_status, reasonCode: r.reason_code, reason: r.reason,
      missingItems: r.details?.missingItems ?? undefined,
    }));
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
    const { rows } = await tx.query<RequestRow>(
      `SELECT ${COLUMNS} FROM req.blood_request r WHERE r.id = $2 AND ${OWNED} FOR UPDATE OF r`,
      [principal.userId, id],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    const decision = this.policy.decide(principal, 'blood_request.edit', { resource: { ownerUserId: principal.userId } });
    if (!decision.allowed) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    return rows[0];
  }

  private async getOwned(db: Db, principal: Principal, id: string) {
    const { rows } = await db.query<RequestRow>(`SELECT ${COLUMNS} FROM req.blood_request r WHERE r.id = $2 AND ${OWNED}`, [
      principal.userId,
      id,
    ]);
    if (!rows[0]) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    return toRequestView(rows[0]);
  }
}
