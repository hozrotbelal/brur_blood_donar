import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { findTransition, requestStateMachine, RequestStatus } from '../request/request.public';
import { CaseService } from './case.service';
import { CaseSupport, fail } from './case.support';
import { DisputeOutcomeDto, RecordOutcomeDto, ResolveDisputeDto } from './case.dto';

const COUNTS_TOWARDS_FULFILMENT = ['DONATION_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE'];
const SERVICE_SOURCES = ['COLLECTION_SERVICE_CONFIRMATION', 'HOSPITAL_CONFIRMATION'];

@Injectable()
export class OutcomeService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly support: CaseSupport,
    private readonly cases: CaseService,
    private readonly history: StatusHistoryService,
  ) {}

  async record(principal: Principal, caseId: string, dto: RecordOutcomeDto) {
    if (dto.channel === 'PHONE' && !dto.reportedByName?.trim()) throw fail('REPORTER_NAME_REQUIRED');
    if (COUNTS_TOWARDS_FULFILMENT.includes(dto.outcomeType) && dto.units === undefined) throw fail('UNITS_REQUIRED');
    const reportedAt = dto.reportedAt ? new Date(dto.reportedAt) : new Date();
    if (reportedAt.getTime() > Date.now() + 60_000) throw fail('REPORTED_IN_FUTURE');
    const confidence = SERVICE_SOURCES.includes(dto.sourceType) ? 'Service-confirmed' : 'Self-reported';

    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'outcome.report');
      if (row.status !== 'Attendance pending' && row.status !== 'Outcome pending') throw fail('INVALID_TRANSITION');
      let donorProfileId: string | null = null;
      if (dto.caseDonorId) {
        const own = await tx.query<{ donor_profile_id: string }>('SELECT donor_profile_id FROM crd.case_donor WHERE id = $1 AND case_id = $2', [dto.caseDonorId, caseId]);
        if (!own.rows[0]) throw fail('CASE_DONOR_NOT_FOUND', 404);
        donorProfileId = own.rows[0].donor_profile_id;
      }
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO crd.outcome_update (case_id, request_id, case_donor_id, outcome_type, source_type, confidence, reported_by_name, reported_by_role,
                                         channel, reported_at, recorded_by, units_count, reason_text)
         VALUES ($1, $2, $3, $4::outcome_type, $5::outcome_source_type, $6::outcome_confidence, $7, $8, $9::report_channel, $10, $11, $12, $13) RETURNING id`,
        [caseId, row.request_id, dto.caseDonorId ?? null, dto.outcomeType, dto.sourceType, confidence, dto.reportedByName ?? null, dto.reportedByRole ?? null,
          dto.channel, reportedAt, principal.userId, dto.units ?? null, dto.reason ?? null],
      );
      let current = row;
      if (current.status === 'Attendance pending') current = await this.support.moveCase(tx, current, 'Outcome pending', { userId: principal.userId, role: 'SUP' }, 'Outcome recorded');

      if (COUNTS_TOWARDS_FULFILMENT.includes(dto.outcomeType)) await this.markAwaitingOutcome(tx, row.request_id, principal.userId);
      if (dto.outcomeType === 'DONATION_NOT_COMPLETED' && dto.caseDonorId) {
        await this.cases.handleDonorLeft(tx, { caseDonorId: dto.caseDonorId, kind: 'NOT_COMPLETED', actorUserId: principal.userId, actorRole: 'SUP' });
      }
      await this.support.event(
        tx,
        'COORDINATION_CASE',
        caseId,
        'OutcomeRecorded',
        {
          outcomeId: inserted.rows[0].id,
          caseId,
          requestId: row.request_id,
          caseDonorId: dto.caseDonorId ?? null,
          donorProfileId,
          outcomeType: dto.outcomeType,
          sourceType: dto.sourceType,
          confidence,
          reportedAt: reportedAt.toISOString(),
          units: dto.units ?? null,
        },
        Date.now(),
      );
      return { id: inserted.rows[0].id, confidence, caseStatus: current.status };
    });
  }

  async setFulfilment(principal: Principal, caseId: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const request = await tx.query<{ status: RequestStatus; quantity_units: number }>(
        'SELECT status, quantity_units FROM req.blood_request WHERE id = $1 FOR UPDATE',
        [row.request_id],
      );
      const req = request.rows[0];
      if (req.status !== 'Awaiting outcome' || row.status !== 'Outcome pending') throw fail('INVALID_TRANSITION');
      if (row.disputed) throw fail('CASE_DISPUTED');
      const units = await tx.query<{ n: number }>(
        `SELECT COALESCE(sum(units_count), 0)::int AS n FROM crd.outcome_update o
          WHERE o.case_id = $1 AND o.confidence = 'Service-confirmed' AND o.outcome_type = ANY($2::outcome_type[]) AND NOT o.is_disputed
            AND NOT EXISTS (SELECT 1 FROM crd.outcome_update s WHERE s.supersedes_id = o.id)`,
        [caseId, COUNTS_TOWARDS_FULFILMENT],
      );
      const confirmed = Math.min(units.rows[0].n, req.quantity_units);
      if (confirmed === 0) throw fail('FULFILMENT_NEEDS_SERVICE_CONFIRMATION');

      const full = confirmed >= req.quantity_units;
      const to: RequestStatus = full ? 'Fulfilled' : 'Partially fulfilled';
      const command = full ? 'record_full_outcome' : 'record_partial_outcome';
      if (!findTransition('Awaiting outcome', command)) throw fail('INVALID_TRANSITION');
      await tx.query(
        `UPDATE req.blood_request SET status = $2::request_status, fulfilled_quantity_units = $3, outcome_confirmed_at = COALESCE(outcome_confirmed_at, now()),
                fulfilled_at = CASE WHEN $2 = 'Fulfilled' THEN now() ELSE fulfilled_at END, version = version + 1, updated_at = now() WHERE id = $1`,
        [row.request_id, to, confirmed],
      );
      await this.history.record(
        tx,
        {
          entityType: 'BLOOD_REQUEST', entityId: row.request_id, from: 'Awaiting outcome', to, actorUserId: principal.userId, actorRole: 'SUP',
          source: 'USER', contextRequestId: row.request_id, details: { confirmedUnits: confirmed, requestedUnits: req.quantity_units }, correlationId: randomUUID(),
        },
        requestStateMachine,
      );
      await tx.query(
        `UPDATE crd.case_donor SET status = 'Completed', version = version + 1, updated_at = now()
          WHERE case_id = $1 AND status = 'Active' AND id IN (SELECT case_donor_id FROM crd.outcome_update WHERE case_id = $1 AND outcome_type = 'DONATION_COMPLETED' AND confidence = 'Service-confirmed')`,
        [caseId],
      );
      await this.support.finishTask(tx, caseId, 'TK_OBTAIN_SOURCED_OUTCOME', principal.userId);
      if (full) await this.support.moveCase(tx, row, 'Resolved', { userId: principal.userId, role: 'SUP' }, 'Fulfilled');
      else await this.support.openTask(tx, row, 'TK_CONFIRM_MORE_DONORS_NEEDED', `more:${caseId}`, 120);
      await this.support.event(tx, 'BLOOD_REQUEST', row.request_id, full ? 'RequestFulfilled' : 'RequestPartiallyFulfilled', { confirmedUnits: confirmed }, Date.now());
      return { requestStatus: to, confirmedUnits: confirmed, requestedUnits: req.quantity_units };
    });
  }

  async dispute(principal: Principal, caseId: string, outcomeId: string, dto: DisputeOutcomeDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const found = await tx.query<{ is_disputed: boolean }>(
        `SELECT o.is_disputed FROM crd.outcome_update o
          WHERE o.id = $1 AND o.case_id = $2 AND NOT EXISTS (SELECT 1 FROM crd.outcome_update s WHERE s.supersedes_id = o.id) FOR UPDATE`,
        [outcomeId, caseId],
      );
      if (!found.rows[0]) throw fail('OUTCOME_NOT_FOUND', 404);
      if (found.rows[0].is_disputed) throw fail('ALREADY_DISPUTED', 409);
      await tx.query('UPDATE crd.outcome_update SET is_disputed = true WHERE id = $1', [outcomeId]);
      await tx.query('UPDATE crd.coordination_case SET disputed = true, version = version + 1, updated_at = now() WHERE id = $1', [caseId]);
      await tx.query(`INSERT INTO crd.case_note (case_id, author_user_id, note_type, body) VALUES ($1, $2, 'ESCALATION', $3)`, [caseId, principal.userId, dto.reason]);
      await tx.query(
        `INSERT INTO crd.escalation (subject_type, subject_id, request_id, case_id, level, reason, status, escalated_to_user_id, dedupe_key)
         VALUES ('COORDINATION_CASE', $1, $2, $1, 1, 'DISPUTED', 'Open', $3, $4) ON CONFLICT (dedupe_key) DO NOTHING`,
        [caseId, row.request_id, row.owner_user_id, `dispute:${outcomeId}`],
      );
      await this.support.event(tx, 'COORDINATION_CASE', caseId, 'OutcomeDisputed', { outcomeId, caseId, requestId: row.request_id }, Date.now());
      return { caseId, outcomeId, disputed: true };
    });
  }

  async resolveDispute(principal: Principal, caseId: string, outcomeId: string, dto: ResolveDisputeDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const found = await tx.query<{ case_donor_id: string | null; units_count: number | null }>(
        `SELECT o.case_donor_id, o.units_count FROM crd.outcome_update o
          WHERE o.id = $1 AND o.case_id = $2 AND o.is_disputed AND NOT EXISTS (SELECT 1 FROM crd.outcome_update s WHERE s.supersedes_id = o.id) FOR UPDATE`,
        [outcomeId, caseId],
      );
      const original = found.rows[0];
      if (!original) throw fail('NO_OPEN_DISPUTE', 404);
      let correctionId: string | null = null;
      if (dto.resolution === 'UPHELD') {
        await tx.query('UPDATE crd.outcome_update SET is_disputed = false WHERE id = $1', [outcomeId]);
      } else {
        const c = dto.correction;
        if (!c) throw fail('CORRECTION_REQUIRED');
        if (COUNTS_TOWARDS_FULFILMENT.includes(c.outcomeType) && c.units === undefined) throw fail('UNITS_REQUIRED');
        if (c.channel === 'PHONE' && !c.reportedByName?.trim()) throw fail('REPORTER_NAME_REQUIRED');
        const confidence = SERVICE_SOURCES.includes(c.sourceType) ? 'Service-confirmed' : 'Self-reported';
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO crd.outcome_update (case_id, request_id, case_donor_id, outcome_type, source_type, confidence, reported_by_name, reported_by_role,
                                           channel, reported_at, recorded_by, units_count, reason_text, supersedes_id)
           VALUES ($1, $2, $3, $4::outcome_type, $5::outcome_source_type, $6::outcome_confidence, $7, $8, $9::report_channel, now(), $10, $11, $12, $13) RETURNING id`,
          [caseId, row.request_id, original.case_donor_id, c.outcomeType, c.sourceType, confidence, c.reportedByName ?? null, c.reportedByRole ?? null,
            c.channel, principal.userId, c.units ?? null, c.reason ?? null, outcomeId],
        );
        correctionId = inserted.rows[0].id;
      }
      const remaining = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM crd.outcome_update o
          WHERE o.case_id = $1 AND o.is_disputed AND NOT EXISTS (SELECT 1 FROM crd.outcome_update s WHERE s.supersedes_id = o.id)`,
        [caseId],
      );
      const stillDisputed = remaining.rows[0].n > 0;
      await tx.query('UPDATE crd.coordination_case SET disputed = $2, version = version + 1, updated_at = now() WHERE id = $1', [caseId, stillDisputed]);
      await tx.query(
        `UPDATE crd.escalation SET status = 'Resolved', version = version + 1, updated_at = now() WHERE dedupe_key = $1 AND status IN ('Open','Acknowledged')`,
        [`dispute:${outcomeId}`],
      );
      await tx.query(`INSERT INTO crd.case_note (case_id, author_user_id, note_type, body) VALUES ($1, $2, 'GENERAL', $3)`, [caseId, principal.userId, dto.note]);
      await this.support.event(
        tx, 'COORDINATION_CASE', caseId, 'OutcomeDisputeResolved',
        { outcomeId, caseId, requestId: row.request_id, resolution: dto.resolution, correctionId },
        Date.now(),
      );
      return { caseId, outcomeId, resolution: dto.resolution, correctionId, disputed: stillDisputed };
    });
  }

  async moreDonors(principal: Principal, caseId: string, needed: boolean) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const request = await tx.query<{ status: RequestStatus }>('SELECT status FROM req.blood_request WHERE id = $1 FOR UPDATE', [row.request_id]);
      if (request.rows[0].status !== 'Partially fulfilled' || row.status !== 'Outcome pending') throw fail('INVALID_TRANSITION');
      await this.support.finishTask(tx, caseId, 'TK_CONFIRM_MORE_DONORS_NEEDED', principal.userId);
      if (needed) {
        await tx.query(`UPDATE req.blood_request SET status = 'Searching', version = version + 1, updated_at = now() WHERE id = $1`, [row.request_id]);
        await this.history.record(
          tx,
          {
            entityType: 'BLOOD_REQUEST', entityId: row.request_id, from: 'Partially fulfilled', to: 'Searching', actorUserId: principal.userId, actorRole: 'SUP',
            source: 'USER', contextRequestId: row.request_id, reasonCode: 'MORE_DONORS_NEEDED', correlationId: randomUUID(),
          },
          requestStateMachine,
        );
        await this.support.moveCase(tx, row, 'Open', { userId: principal.userId, role: 'SUP' }, 'More donors needed');
        await this.support.openTask(tx, row, 'TK_OBTAIN_SOURCED_OUTCOME', `outcome-more:${caseId}:${Date.now()}`, 1440);
        return { requestStatus: 'Searching' };
      }
      await this.support.moveCase(tx, row, 'Resolved', { userId: principal.userId, role: 'SUP' }, 'No more donors needed');
      return { requestStatus: 'Partially fulfilled' };
    });
  }

  async declareUnable(principal: Principal, requestId: string, reason: string) {
    return this.db.transaction(async (tx) => {
      const found = await tx.query<{ id: string }>('SELECT id FROM crd.coordination_case WHERE request_id = $1', [requestId]);
      const request = await tx.query<{ status: RequestStatus; assigned_support_user_id: string | null; area_id: string | null }>(
        'SELECT status, assigned_support_user_id, area_id FROM req.blood_request WHERE id = $1 FOR UPDATE',
        [requestId],
      );
      const req = request.rows[0];
      if (!req) throw fail('REQUEST_NOT_FOUND', 404);
      const caseRow = found.rows[0] ? await this.support.loadCase(tx, found.rows[0].id, true) : null;
      if (caseRow) await this.support.requireAccess(tx, principal, caseRow, 'case.edit');
      else if (req.assigned_support_user_id !== principal.userId) throw fail('REQUEST_NOT_FOUND', 404);
      if (!findTransition(req.status, 'declare_unable')) throw fail('INVALID_TRANSITION');

      await tx.query(`UPDATE req.blood_request SET status = 'Unable to fulfil', closed_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [requestId]);
      await this.history.record(
        tx,
        {
          entityType: 'BLOOD_REQUEST', entityId: requestId, from: req.status, to: 'Unable to fulfil', actorUserId: principal.userId, actorRole: 'SUP',
          source: 'USER', contextRequestId: requestId, reasonCode: 'UNABLE_TO_FULFIL', reason, correlationId: randomUUID(),
        },
        requestStateMachine,
      );
      await this.cancelOpenInvitations(tx, requestId);
      if (caseRow) await this.cases.reconcileOne(tx, caseRow.id);
      await this.support.event(tx, 'BLOOD_REQUEST', requestId, 'RequestUnableToFulfil', { reason });
      return { requestStatus: 'Unable to fulfil' };
    });
  }

  private async markAwaitingOutcome(tx: Db, requestId: string, userId: string) {
    const r = await tx.query<{ status: string }>('SELECT status FROM req.blood_request WHERE id = $1 FOR UPDATE', [requestId]);
    await tx.query('UPDATE req.blood_request SET donation_reported_at = COALESCE(donation_reported_at, now()) WHERE id = $1', [requestId]);
    if (r.rows[0]?.status !== 'Donor coordination') return;
    await tx.query(`UPDATE req.blood_request SET status = 'Awaiting outcome', version = version + 1, updated_at = now() WHERE id = $1`, [requestId]);
    await this.history.record(
      tx,
      {
        entityType: 'BLOOD_REQUEST', entityId: requestId, from: 'Donor coordination', to: 'Awaiting outcome', actorUserId: userId, actorRole: 'SUP',
        source: 'USER', contextRequestId: requestId, reasonCode: 'OUTCOME_RECORDED', correlationId: randomUUID(),
      },
      requestStateMachine,
    );
  }

  private cancelOpenInvitations(tx: Db, requestId: string) {
    return tx.query(
      `UPDATE src.invitation SET status = 'Cancelled', cancelled_at = now(), cancel_reason = 'REQUEST_CLOSED', version = version + 1, updated_at = now()
        WHERE request_id = $1 AND status IN ('Queued','Sent','Delivered','Viewed')`,
      [requestId],
    );
  }
}
