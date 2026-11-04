import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { cancelOpenInvitations } from '../matching/matching.public';
import { declareRequestUnable, findTransition, markDonationReported, recordFulfilment, requestState, returnToSearching } from '../request/request.public';
import { CaseService } from './case.service';
import { CaseSupport, fail } from './case.support';
import { DisputeOutcomeDto, RecordOutcomeDto, ResolveDisputeDto } from './case.dto';
import { caseDonor, coordinationCase, escalation, outcomeUpdate } from './schema';

type OutcomeValues = Pick<typeof outcomeUpdate.$inferInsert, 'outcomeType' | 'sourceType' | 'channel'>;

const COUNTS_TOWARDS_FULFILMENT: OutcomeValues['outcomeType'][] = ['DONATION_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE'];
const SERVICE_SOURCES = ['COLLECTION_SERVICE_CONFIRMATION', 'HOSPITAL_CONFIRMATION'];

const superseding = alias(outcomeUpdate, 'superseding');
const notSuperseded = (db: Db) => notExists(db.orm.select({ id: superseding.id }).from(superseding).where(eq(superseding.supersedesId, outcomeUpdate.id)));

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
    if (COUNTS_TOWARDS_FULFILMENT.includes(dto.outcomeType as OutcomeValues['outcomeType']) && dto.units === undefined) throw fail('UNITS_REQUIRED');
    const reportedAt = dto.reportedAt ? new Date(dto.reportedAt) : new Date();
    if (reportedAt.getTime() > Date.now() + 60_000) throw fail('REPORTED_IN_FUTURE');
    const confidence = SERVICE_SOURCES.includes(dto.sourceType) ? 'Service-confirmed' : 'Self-reported';

    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'outcome.report');
      if (row.status !== 'Attendance pending' && row.status !== 'Outcome pending') throw fail('INVALID_TRANSITION');
      let donorProfileId: string | null = null;
      if (dto.caseDonorId) {
        const [own] = await tx.orm
          .select({ donorProfileId: caseDonor.donorProfileId })
          .from(caseDonor)
          .where(and(eq(caseDonor.id, dto.caseDonorId), eq(caseDonor.caseId, caseId)));
        if (!own) throw fail('CASE_DONOR_NOT_FOUND', 404);
        donorProfileId = own.donorProfileId;
      }
      const [inserted] = await tx.orm
        .insert(outcomeUpdate)
        .values({
          caseId, requestId: row.requestId, caseDonorId: dto.caseDonorId ?? null, outcomeType: dto.outcomeType as OutcomeValues['outcomeType'],
          sourceType: dto.sourceType as OutcomeValues['sourceType'], confidence, reportedByName: dto.reportedByName ?? null, reportedByRole: dto.reportedByRole ?? null,
          channel: dto.channel as OutcomeValues['channel'], reportedAt, recordedBy: principal.userId, unitsCount: dto.units ?? null, reasonText: dto.reason ?? null,
        })
        .returning({ id: outcomeUpdate.id });
      let current = row;
      if (current.status === 'Attendance pending') current = await this.support.moveCase(tx, current, 'Outcome pending', { userId: principal.userId, role: 'SUP' }, 'Outcome recorded');

      if (COUNTS_TOWARDS_FULFILMENT.includes(dto.outcomeType as OutcomeValues['outcomeType'])) {
        await markDonationReported(tx, this.history, row.requestId, { userId: principal.userId, role: 'SUP' }, 'OUTCOME_RECORDED');
      }
      if (dto.outcomeType === 'DONATION_NOT_COMPLETED' && dto.caseDonorId) {
        await this.cases.handleDonorLeft(tx, { caseDonorId: dto.caseDonorId, kind: 'NOT_COMPLETED', actorUserId: principal.userId, actorRole: 'SUP' });
      }
      await this.support.event(
        tx,
        'COORDINATION_CASE',
        caseId,
        'OutcomeRecorded',
        {
          outcomeId: inserted.id,
          caseId,
          requestId: row.requestId,
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
      return { id: inserted.id, confidence, caseStatus: current.status };
    });
  }

  async setFulfilment(principal: Principal, caseId: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const req = (await requestState(tx, row.requestId, true))!;
      if (req.status !== 'Awaiting outcome' || row.status !== 'Outcome pending') throw fail('INVALID_TRANSITION');
      if (row.disputed) throw fail('CASE_DISPUTED');
      const [units] = await tx.orm
        .select({ n: sql<number>`COALESCE(sum(${outcomeUpdate.unitsCount}), 0)::int` })
        .from(outcomeUpdate)
        .where(and(
          eq(outcomeUpdate.caseId, caseId), eq(outcomeUpdate.confidence, 'Service-confirmed'), inArray(outcomeUpdate.outcomeType, COUNTS_TOWARDS_FULFILMENT),
          eq(outcomeUpdate.isDisputed, false), notSuperseded(tx),
        ));
      const confirmed = Math.min(units.n, req.quantityUnits);
      if (confirmed === 0) throw fail('FULFILMENT_NEEDS_SERVICE_CONFIRMATION');

      const full = confirmed >= req.quantityUnits;
      const to = await recordFulfilment(tx, this.history, row.requestId, confirmed, req.quantityUnits, principal.userId);
      const completed = tx.orm
        .select({ id: outcomeUpdate.caseDonorId })
        .from(outcomeUpdate)
        .where(and(eq(outcomeUpdate.caseId, caseId), eq(outcomeUpdate.outcomeType, 'DONATION_COMPLETED'), eq(outcomeUpdate.confidence, 'Service-confirmed')));
      await tx.orm
        .update(caseDonor)
        .set({ status: 'Completed', version: sql`${caseDonor.version} + 1`, updatedAt: sql`now()` })
        .where(and(eq(caseDonor.caseId, caseId), eq(caseDonor.status, 'Active'), inArray(caseDonor.id, completed)));
      await this.support.finishTask(tx, caseId, 'TK_OBTAIN_SOURCED_OUTCOME', principal.userId);
      if (full) await this.support.moveCase(tx, row, 'Resolved', { userId: principal.userId, role: 'SUP' }, 'Fulfilled');
      else await this.support.openTask(tx, row, 'TK_CONFIRM_MORE_DONORS_NEEDED', `more:${caseId}`, 120);
      await this.support.event(tx, 'BLOOD_REQUEST', row.requestId, full ? 'RequestFulfilled' : 'RequestPartiallyFulfilled', { confirmedUnits: confirmed }, Date.now());
      return { requestStatus: to, confirmedUnits: confirmed, requestedUnits: req.quantityUnits };
    });
  }

  async dispute(principal: Principal, caseId: string, outcomeId: string, dto: DisputeOutcomeDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const [found] = await tx.orm
        .select({ isDisputed: outcomeUpdate.isDisputed })
        .from(outcomeUpdate)
        .where(and(eq(outcomeUpdate.id, outcomeId), eq(outcomeUpdate.caseId, caseId), notSuperseded(tx)))
        .for('update');
      if (!found) throw fail('OUTCOME_NOT_FOUND', 404);
      if (found.isDisputed) throw fail('ALREADY_DISPUTED', 409);
      await tx.orm.update(outcomeUpdate).set({ isDisputed: true }).where(eq(outcomeUpdate.id, outcomeId));
      await this.setCaseDisputed(tx, caseId, true);
      await this.cases.insertNote(tx, caseId, principal.userId, 'ESCALATION', dto.reason);
      await tx.orm
        .insert(escalation)
        .values({
          subjectType: 'COORDINATION_CASE', subjectId: caseId, requestId: row.requestId, caseId, level: 1, reason: 'DISPUTED', status: 'Open',
          escalatedToUserId: row.ownerUserId, dedupeKey: `dispute:${outcomeId}`,
        })
        .onConflictDoNothing({ target: escalation.dedupeKey });
      await this.support.event(tx, 'COORDINATION_CASE', caseId, 'OutcomeDisputed', { outcomeId, caseId, requestId: row.requestId }, Date.now());
      return { caseId, outcomeId, disputed: true };
    });
  }

  async resolveDispute(principal: Principal, caseId: string, outcomeId: string, dto: ResolveDisputeDto) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const [original] = await tx.orm
        .select({ caseDonorId: outcomeUpdate.caseDonorId, unitsCount: outcomeUpdate.unitsCount })
        .from(outcomeUpdate)
        .where(and(eq(outcomeUpdate.id, outcomeId), eq(outcomeUpdate.caseId, caseId), eq(outcomeUpdate.isDisputed, true), notSuperseded(tx)))
        .for('update');
      if (!original) throw fail('NO_OPEN_DISPUTE', 404);
      let correctionId: string | null = null;
      if (dto.resolution === 'UPHELD') {
        await tx.orm.update(outcomeUpdate).set({ isDisputed: false }).where(eq(outcomeUpdate.id, outcomeId));
      } else {
        const c = dto.correction;
        if (!c) throw fail('CORRECTION_REQUIRED');
        if (COUNTS_TOWARDS_FULFILMENT.includes(c.outcomeType as OutcomeValues['outcomeType']) && c.units === undefined) throw fail('UNITS_REQUIRED');
        if (c.channel === 'PHONE' && !c.reportedByName?.trim()) throw fail('REPORTER_NAME_REQUIRED');
        const confidence = SERVICE_SOURCES.includes(c.sourceType) ? 'Service-confirmed' : 'Self-reported';
        const [inserted] = await tx.orm
          .insert(outcomeUpdate)
          .values({
            caseId, requestId: row.requestId, caseDonorId: original.caseDonorId, outcomeType: c.outcomeType as OutcomeValues['outcomeType'],
            sourceType: c.sourceType as OutcomeValues['sourceType'], confidence, reportedByName: c.reportedByName ?? null, reportedByRole: c.reportedByRole ?? null,
            channel: c.channel as OutcomeValues['channel'], reportedAt: sql`now()`, recordedBy: principal.userId, unitsCount: c.units ?? null,
            reasonText: c.reason ?? null, supersedesId: outcomeId,
          })
          .returning({ id: outcomeUpdate.id });
        correctionId = inserted.id;
      }
      const [remaining] = await tx.orm
        .select({ n: count() })
        .from(outcomeUpdate)
        .where(and(eq(outcomeUpdate.caseId, caseId), eq(outcomeUpdate.isDisputed, true), notSuperseded(tx)));
      const stillDisputed = remaining.n > 0;
      await this.setCaseDisputed(tx, caseId, stillDisputed);
      await tx.orm
        .update(escalation)
        .set({ status: 'Resolved', version: sql`${escalation.version} + 1`, updatedAt: sql`now()` })
        .where(and(eq(escalation.dedupeKey, `dispute:${outcomeId}`), inArray(escalation.status, ['Open', 'Acknowledged'])));
      await this.cases.insertNote(tx, caseId, principal.userId, 'GENERAL', dto.note);
      await this.support.event(
        tx, 'COORDINATION_CASE', caseId, 'OutcomeDisputeResolved',
        { outcomeId, caseId, requestId: row.requestId, resolution: dto.resolution, correctionId },
        Date.now(),
      );
      return { caseId, outcomeId, resolution: dto.resolution, correctionId, disputed: stillDisputed };
    });
  }

  async moreDonors(principal: Principal, caseId: string, needed: boolean) {
    return this.db.transaction(async (tx) => {
      const row = await this.support.loadCase(tx, caseId, true);
      await this.support.requireAccess(tx, principal, row, 'case.edit');
      const request = await requestState(tx, row.requestId, true);
      if (request?.status !== 'Partially fulfilled' || row.status !== 'Outcome pending') throw fail('INVALID_TRANSITION');
      await this.support.finishTask(tx, caseId, 'TK_CONFIRM_MORE_DONORS_NEEDED', principal.userId);
      if (needed) {
        await returnToSearching(tx, this.history, row.requestId, 'Partially fulfilled', { userId: principal.userId, role: 'SUP' }, 'MORE_DONORS_NEEDED');
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
      const [found] = await tx.orm.select({ id: coordinationCase.id }).from(coordinationCase).where(eq(coordinationCase.requestId, requestId));
      const req = await requestState(tx, requestId, true);
      if (!req) throw fail('REQUEST_NOT_FOUND', 404);
      const caseRow = found ? await this.support.loadCase(tx, found.id, true) : null;
      if (caseRow) await this.support.requireAccess(tx, principal, caseRow, 'case.edit');
      else if (req.assignedSupportUserId !== principal.userId) throw fail('REQUEST_NOT_FOUND', 404);
      if (!findTransition(req.status, 'declare_unable')) throw fail('INVALID_TRANSITION');

      await declareRequestUnable(tx, this.history, requestId, req.status, reason, principal.userId);
      await cancelOpenInvitations(tx, requestId);
      if (caseRow) await this.cases.reconcileOne(tx, caseRow.id);
      await this.support.event(tx, 'BLOOD_REQUEST', requestId, 'RequestUnableToFulfil', { reason });
      return { requestStatus: 'Unable to fulfil' };
    });
  }

  private async setCaseDisputed(tx: Db, caseId: string, disputed: boolean) {
    await tx.orm
      .update(coordinationCase)
      .set({ disputed, version: sql`${coordinationCase.version} + 1`, updatedAt: sql`now()` })
      .where(eq(coordinationCase.id, caseId));
  }
}
