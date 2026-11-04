import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { PolicyService } from '../../platform/policy/policy.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { cancelBatchReviewTask, completeBatchReviewTasks, openBatchReviewTask } from '../case-workflow/case-workflow.public';
import { activeGlobalSettings } from '../configuration/read-model.public';
import { donorLabels } from '../identity/read-model.public';
import { markSearching } from '../request/request.public';
import { DonorFacts, REASON_LABELS, SearchParams, Urgency, compareCandidates, evaluateDonor, radiusSteps, responseWindowMinutes } from './matching.rules';
import { invitation, matchCandidate, matchRun, outreachGroupRule } from './schema';

type RunTrigger = (typeof matchRun.$inferSelect)['trigger'];
type ReasonCode = (typeof matchCandidate.$inferSelect)['reasonCodes'][number];

export interface SearchSettings {
  waveSizeDefault: number;
  waveSizeCritical: number;
  radiusStepsKm: number[];
  maxWaves: number;
  requireVerifiedGroup: Record<Urgency, boolean>;
  maxInvitesPer24h: number;
  maxInvitesPer30d: number;
  criticalBypassContactHours: boolean;
}

const DEFAULTS: SearchSettings = {
  waveSizeDefault: 10,
  waveSizeCritical: 20,
  radiusStepsKm: [5, 10, 20, 40],
  maxWaves: 5,
  requireVerifiedGroup: { Critical: false, Urgent: false, Routine: true },
  maxInvitesPer24h: 1,
  maxInvitesPer30d: 4,
  criticalBypassContactHours: true,
};

const SETTING_KEYS = [
  'search.wave_size.default', 'search.wave_size.critical', 'search.radius_steps_km', 'search.max_waves',
  'search.require_verified_group.critical', 'search.require_verified_group.urgent', 'search.require_verified_group.routine',
  'outreach.max_invites_per_24h', 'outreach.max_invites_per_30d', 'outreach.critical_bypass_contact_hours',
];

const OPEN_RUN = ['Pending', 'Pending approval', 'Approved', 'Dispatching', 'Awaiting responses', 'Paused'];
const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

interface RequestRow {
  id: string;
  reference_no: string | null;
  status: string;
  urgency: Urgency;
  requested_blood_group: string;
  component: string;
  required_by: Date;
  area_id: string | null;
  outreach_paused: boolean;
  has_moderation_hold: boolean;
  assigned_support_user_id: string | null;
  created_by_user_id: string;
  has_location: boolean;
  version: number;
}

interface FactsRow {
  donor_profile_id: string;
  blood_group_status: string;
  donor_status: string;
  account_status: string;
  next_contact_date: string | null;
  travel_radius_km: number;
  distance_km: number | null;
  routine_available: boolean | null;
  urgent_available: boolean | null;
  paused_until: Date | null;
  contact_start: string | null;
  contact_end: string | null;
  contact_days: string | null;
  has_urgent: boolean;
  has_routine: boolean;
  has_channel: boolean;
  restricted: boolean;
  active_commitment: boolean;
  invites_24h: number;
  invites_30d: number;
  invited_for_request: boolean;
  is_requester: boolean;
  last_available_at: Date | null;
}

@Injectable()
export class MatchingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
  ) {}

  async loadSettings(db: Db): Promise<SearchSettings> {
    const v = await activeGlobalSettings(db, SETTING_KEYS);
    const num = (k: string, d: number) => (typeof v.get(k) === 'number' ? (v.get(k) as number) : d);
    const bool = (k: string, d: boolean) => (typeof v.get(k) === 'boolean' ? (v.get(k) as boolean) : d);
    const steps = v.get('search.radius_steps_km');
    return {
      waveSizeDefault: num('search.wave_size.default', DEFAULTS.waveSizeDefault),
      waveSizeCritical: num('search.wave_size.critical', DEFAULTS.waveSizeCritical),
      radiusStepsKm: Array.isArray(steps) && steps.every((s) => typeof s === 'number') && steps.length > 0 ? (steps as number[]) : DEFAULTS.radiusStepsKm,
      maxWaves: num('search.max_waves', DEFAULTS.maxWaves),
      requireVerifiedGroup: {
        Critical: bool('search.require_verified_group.critical', DEFAULTS.requireVerifiedGroup.Critical),
        Urgent: bool('search.require_verified_group.urgent', DEFAULTS.requireVerifiedGroup.Urgent),
        Routine: bool('search.require_verified_group.routine', DEFAULTS.requireVerifiedGroup.Routine),
      },
      maxInvitesPer24h: num('outreach.max_invites_per_24h', DEFAULTS.maxInvitesPer24h),
      maxInvitesPer30d: num('outreach.max_invites_per_30d', DEFAULTS.maxInvitesPer30d),
      criticalBypassContactHours: bool('outreach.critical_bypass_contact_hours', DEFAULTS.criticalBypassContactHours),
    };
  }

  async expandSearch(principal: Principal, requestId: string) {
    return this.db.transaction(async (tx) => {
      const req = await this.lockRequest(tx, requestId);
      await this.requireStaffAccess(tx, principal, req);
      const waveId = await this.createWave(tx, req, 'SUPPORT_EXPANDED', principal.userId);
      return this.waveView(tx, waveId);
    });
  }

  async startSearch(requestId: string): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const req = await this.lockRequest(tx, requestId);
      if (req.status !== 'Verified') return null;
      return this.createWave(tx, req, 'AUTO_ON_VERIFIED', null);
    });
  }

  async startPendingSearches(): Promise<number> {
    // Raw SQL: cross-module read of request and case state (ADR-16 rule 6).
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT r.id FROM req.blood_request r
         LEFT JOIN apt.facility f ON f.id = r.hospital_facility_id
         LEFT JOIN cfg.area a ON a.id = r.area_id
        WHERE r.status = 'Verified' AND r.deleted_at IS NULL AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          AND (r.location IS NOT NULL OR f.location IS NOT NULL OR a.centroid IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM src.match_run m WHERE m.request_id = r.id) ORDER BY r.verified_at LIMIT 20`,
    );
    let started = 0;
    for (const r of rows) {
      try {
        if (await this.startSearch(r.id)) started++;
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
      }
    }
    return started;
  }

  async proposeNextWaves(): Promise<number> {
    // Raw SQL: cross-module read of request and case state (ADR-16 rule 6).
    const { rows } = await this.db.query<{ request_id: string }>(
      `SELECT DISTINCT m.request_id FROM src.match_run m JOIN req.blood_request r ON r.id = m.request_id
        WHERE m.status = 'Awaiting responses' AND m.response_window_ends_at <= now() AND r.status = 'Searching'
          AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          AND NOT EXISTS (SELECT 1 FROM src.match_run n WHERE n.request_id = m.request_id AND n.status IN ('Pending','Pending approval','Approved','Dispatching'))`,
    );
    let proposed = 0;
    for (const row of rows) {
      try {
        await this.db.transaction(async (tx) => {
          const req = await this.lockRequest(tx, row.request_id);
          if (req.status !== 'Searching') return;
          await this.createWave(tx, req, 'AUTO_NEXT_WAVE', null);
          proposed++;
        });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
      }
    }
    return proposed;
  }

  async proposeReplacementWaves(): Promise<number> {
    // Raw SQL: cross-module read of request and case state (ADR-16 rule 6).
    const { rows } = await this.db.query<{ request_id: string }>(
      `SELECT DISTINCT r.id AS request_id FROM req.blood_request r
         JOIN crd.coordination_case c ON c.request_id = r.id AND c.status = 'Needs replacement'
        WHERE r.status = 'Searching' AND r.deleted_at IS NULL AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          AND NOT EXISTS (SELECT 1 FROM src.match_run n WHERE n.request_id = r.id AND n.status IN ('Pending','Pending approval','Approved','Dispatching'))
          AND NOT EXISTS (SELECT 1 FROM src.match_run n WHERE n.request_id = r.id AND n.trigger = 'REPLACEMENT' AND n.created_at >= c.updated_at)
        LIMIT 20`,
    );
    let proposed = 0;
    for (const row of rows) {
      try {
        await this.db.transaction(async (tx) => {
          const req = await this.lockRequest(tx, row.request_id);
          if (req.status !== 'Searching') return;
          await this.createWave(tx, req, 'REPLACEMENT', null);
          proposed++;
        });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
      }
    }
    return proposed;
  }

  async recheckAfterChange(requestId: string): Promise<{ cancelled: number; waveId: string | null }> {
    return this.db.transaction(async (tx) => {
      const req = await this.lockRequest(tx, requestId);
      if (!['Verified', 'Searching', 'Donor coordination'].includes(req.status)) return { cancelled: 0, waveId: null };
      const correlationId = randomUUID();

      const open = await tx.orm
        .select({ id: invitation.id, status: invitation.status })
        .from(invitation)
        .where(and(eq(invitation.requestId, req.id), inArray(invitation.status, ['Queued', 'Sent', 'Delivered', 'Viewed'])))
        .for('update');
      for (const inv of open) {
        await tx.orm
          .update(invitation)
          .set({ status: 'Cancelled', cancelReason: 'REQUEST_CHANGED', cancelledAt: sql`now()`, version: sql`${invitation.version} + 1`, updatedAt: sql`now()` })
          .where(eq(invitation.id, inv.id));
        await this.history.record(tx, {
          entityType: 'INVITATION', entityId: inv.id, from: inv.status, to: 'Cancelled', actorUserId: null, actorRole: 'SYSTEM',
          source: 'SYSTEM', contextRequestId: req.id, reasonCode: 'REQUEST_CHANGED', correlationId,
        });
      }

      const stale = await tx.orm
        .select({ id: matchRun.id, status: matchRun.status })
        .from(matchRun)
        .where(and(eq(matchRun.requestId, req.id), inArray(matchRun.status, ['Pending', 'Pending approval'])))
        .for('update');
      for (const run of stale) {
        await tx.orm
          .update(matchRun)
          .set({ status: 'Superseded', version: sql`${matchRun.version} + 1`, updatedAt: sql`now()` })
          .where(eq(matchRun.id, run.id));
        await this.history.record(tx, {
          entityType: 'MATCH_RUN', entityId: run.id, from: run.status, to: 'Superseded', actorUserId: null, actorRole: 'SYSTEM',
          source: 'SYSTEM', contextRequestId: req.id, reasonCode: 'REQUEST_CHANGED', correlationId,
        });
        await cancelBatchReviewTask(tx, run.id);
      }

      if (open.length > 0) {
        await this.outbox.append(tx, {
          aggregateType: 'BLOOD_REQUEST', aggregateId: req.id, eventType: 'InvitationsCancelled',
          payload: { invitationIds: open.map((r) => r.id), reason: 'REQUEST_CHANGED' },
          version: req.version,
        });
      }

      let waveId: string | null = null;
      if (req.status === 'Searching' && !req.outreach_paused && !req.has_moderation_hold && req.has_location) {
        waveId = await this.createWave(tx, req, 'MANUAL', null);
      }
      return { cancelled: open.length, waveId };
    });
  }

  async listWaves(principal: Principal, requestId: string) {
    const req = await this.lockRequest(this.db, requestId, false);
    await this.requireStaffAccess(this.db, principal, req, 'blood_request.view');
    const rows = await this.db.orm.select({ id: matchRun.id }).from(matchRun).where(eq(matchRun.requestId, requestId)).orderBy(asc(matchRun.waveNo));
    return Promise.all(rows.map((r) => this.waveView(this.db, r.id)));
  }

  async approveWave(principal: Principal, waveId: string, input: { removeCandidateIds?: string[]; note?: string }) {
    return this.db.transaction(async (tx) => {
      const run = await this.lockRun(tx, waveId);
      const req = await this.lockRequest(tx, run.requestId);
      await this.requireStaffAccess(tx, principal, req);
      if (run.status !== 'Pending approval') {
        if (run.approvedBy === principal.userId) return this.waveView(tx, waveId);
        throw fail('WAVE_NOT_AWAITING_APPROVAL', HttpStatus.CONFLICT);
      }
      if (req.outreach_paused || req.has_moderation_hold) throw fail('OUTREACH_PAUSED');
      if (req.status !== 'Searching') throw fail('REQUEST_NOT_SEARCHING');
      const settings = await this.loadSettings(tx);
      if (run.waveNo > settings.maxWaves && !input.note?.trim()) throw fail('REVIEW_NOTE_REQUIRED');

      const remove = input.removeCandidateIds ?? [];
      if (remove.length > 0) {
        const removed = await tx.orm
          .update(matchCandidate)
          .set({ selectedForInvite: false })
          .where(and(eq(matchCandidate.matchRunId, waveId), inArray(matchCandidate.id, remove), eq(matchCandidate.selectedForInvite, true)))
          .returning({ id: matchCandidate.id });
        if (removed.length !== new Set(remove).size) throw fail('CANDIDATE_NOT_IN_BATCH');
      }
      const selected = await tx.orm
        .select({ id: matchCandidate.id, donorProfileId: matchCandidate.donorProfileId, deferredUntil: matchCandidate.deferredUntil })
        .from(matchCandidate)
        .where(and(eq(matchCandidate.matchRunId, waveId), eq(matchCandidate.selectedForInvite, true)))
        .orderBy(asc(matchCandidate.rank));
      if (selected.length === 0) throw fail('NO_CANDIDATES_SELECTED');

      const windowMin = responseWindowMinutes(req.urgency);
      const payload = {
        requestReference: req.reference_no, hospitalAreaId: req.area_id, bloodGroup: req.requested_blood_group,
        component: req.component, urgency: req.urgency, requiredBy: req.required_by,
      };
      await tx.orm.insert(invitation).values(
        selected.map((c) => ({
          requestId: req.id, donorProfileId: c.donorProfileId, matchRunId: waveId, matchCandidateId: c.id, status: 'Queued' as const,
          queuedAt: c.deferredUntil ?? sql`now()`,
          expiresAt: c.deferredUntil ? new Date(c.deferredUntil.getTime() + windowMin * 60_000) : sql`now() + make_interval(mins => ${windowMin}::int)`,
          payloadSnapshot: payload,
        })),
      );
      await tx.orm
        .update(matchRun)
        .set({
          status: 'Dispatching', approvedBy: principal.userId, responseWindowEndsAt: sql`now() + make_interval(mins => ${windowMin}::int)`,
          version: sql`${matchRun.version} + 1`, updatedAt: sql`now()`,
        })
        .where(eq(matchRun.id, waveId));
      await completeBatchReviewTasks(tx, req.id, principal.userId);
      await this.outbox.append(tx, {
        aggregateType: 'MATCH_RUN', aggregateId: waveId, eventType: 'WaveApproved',
        payload: { requestId: req.id, invitations: selected.length },
      });
      return this.waveView(tx, waveId);
    });
  }

  private async createWave(tx: Db, req: RequestRow, trigger: RunTrigger, actor: string | null): Promise<string> {
    if (req.status !== 'Verified' && req.status !== 'Searching') throw fail('REQUEST_NOT_READY_FOR_SEARCH');
    if (req.outreach_paused || req.has_moderation_hold) throw fail('OUTREACH_PAUSED');
    if (!req.has_location) throw fail('REQUEST_HAS_NO_LOCATION');
    const [pending] = await tx.orm
      .select({ id: matchRun.id })
      .from(matchRun)
      .where(and(eq(matchRun.requestId, req.id), inArray(matchRun.status, ['Pending', 'Pending approval'])))
      .limit(1);
    if (pending) throw fail('WAVE_AWAITING_APPROVAL', HttpStatus.CONFLICT);

    const settings = await this.loadSettings(tx);
    const [last] = await tx.orm.select({ n: max(matchRun.waveNo) }).from(matchRun).where(eq(matchRun.requestId, req.id));
    const waveNo = (last?.n ?? 0) + 1;
    const params: SearchParams = {
      urgency: req.urgency,
      radiusKm: radiusSteps(settings.radiusStepsKm, waveNo),
      waveSize: req.urgency === 'Critical' ? settings.waveSizeCritical : settings.waveSizeDefault,
      requireVerifiedGroup: settings.requireVerifiedGroup[req.urgency],
      maxInvitesPer24h: settings.maxInvitesPer24h,
      maxInvitesPer30d: settings.maxInvitesPer30d,
      criticalBypassContactHours: settings.criticalBypassContactHours,
      now: new Date(),
    };
    const [rule] = await tx.orm.select({ v: max(outreachGroupRule.ruleSetVersion) }).from(outreachGroupRule).where(eq(outreachGroupRule.status, 'Approved'));
    const facts = await this.loadFacts(tx, req);
    const scored = facts.map((f) => ({ facts: f, result: evaluateDonor(f, params) }));
    const included = scored.filter((s) => s.result.included).sort(compareCandidates);
    const proposed = new Set(included.slice(0, params.waveSize).map((s) => s.facts.donorProfileId));

    await tx.orm
      .update(matchRun)
      .set({ status: 'Completed', version: sql`${matchRun.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(matchRun.requestId, req.id), inArray(matchRun.status, ['Awaiting responses', 'Dispatching', 'Approved'])));
    const [run] = await tx.orm
      .insert(matchRun)
      .values({
        requestId: req.id, waveNo, status: 'Pending approval', trigger, mode: 'PHASE1_CONTROLLED', radiusKm: String(params.radiusKm), waveSize: params.waveSize,
        filtersVersion: 1, groupRuleVersion: rule?.v ?? 0, paramsSnapshot: { ...params, now: params.now.toISOString() },
        candidatesEvaluated: scored.length, candidatesIncluded: included.length,
      })
      .returning({ id: matchRun.id });
    const distance = (km: number | null) => (km === null ? null : String(km));
    const candidates = [
      ...included.map((s, i) => ({
        matchRunId: run.id, donorProfileId: s.facts.donorProfileId, included: true, rank: i + 1, distanceKmApprox: distance(s.facts.distanceKm),
        reasonCodes: ['RK_DISTANCE_BAND', ...s.result.reasons] as ReasonCode[], deferredUntil: s.result.deferredUntil, selectedForInvite: proposed.has(s.facts.donorProfileId),
      })),
      ...scored.filter((x) => !x.result.included).map((s) => ({
        matchRunId: run.id, donorProfileId: s.facts.donorProfileId, included: false, distanceKmApprox: distance(s.facts.distanceKm), reasonCodes: s.result.reasons as ReasonCode[],
      })),
    ];
    if (candidates.length > 0) await tx.orm.insert(matchCandidate).values(candidates);
    await openBatchReviewTask(tx, req.id, run.id, req.assigned_support_user_id);
    if (req.status === 'Verified') await markSearching(tx, this.history, req.id, actor);
    await this.outbox.append(tx, {
      aggregateType: 'MATCH_RUN', aggregateId: run.id, eventType: 'WaveProposed',
      payload: { requestId: req.id, waveNo, included: included.length, evaluated: scored.length },
    });
    return run.id;
  }

  private async loadFacts(tx: Db, req: RequestRow): Promise<DonorFacts[]> {
    // Raw SQL: PostGIS distance and cross-module donor facts (ADR-16 rule 6).
    const { rows } = await tx.query<FactsRow>(
      `WITH loc AS (
         SELECT COALESCE(r.location, f.location, a.centroid) AS point
           FROM req.blood_request r
           LEFT JOIN apt.facility f ON f.id = r.hospital_facility_id
           LEFT JOIN cfg.area a ON a.id = r.area_id
          WHERE r.id = $1),
       groups AS (
         SELECT $2::blood_group AS g
         UNION
         SELECT outreach_group FROM src.outreach_group_rule
          WHERE status = 'Approved' AND requested_group = $2::blood_group
            AND (effective_from IS NULL OR effective_from <= current_date) AND (effective_to IS NULL OR effective_to >= current_date))
       SELECT d.id AS donor_profile_id, d.blood_group_status, d.donor_status, u.account_status,
              d.provisional_next_contact_date::text AS next_contact_date, d.travel_radius_km,
              CASE WHEN d.approx_location IS NULL OR loc.point IS NULL THEN NULL ELSE ST_Distance(d.approx_location, loc.point) / 1000.0 END AS distance_km,
              a.routine_available, a.urgent_available, a.paused_until, a.contact_start::text, a.contact_end::text, a.contact_days,
              EXISTS (SELECT 1 FROM idn.consent_record c WHERE c.user_id = d.user_id AND c.consent_type = 'URGENT_INVITATIONS' AND c.granted AND c.withdrawn_at IS NULL) AS has_urgent,
              EXISTS (SELECT 1 FROM idn.consent_record c WHERE c.user_id = d.user_id AND c.consent_type = 'ROUTINE_INVITATIONS' AND c.granted AND c.withdrawn_at IS NULL) AS has_routine,
              EXISTS (SELECT 1 FROM idn.consent_record c WHERE c.user_id = d.user_id AND c.consent_type IN ('CHANNEL_PUSH','CHANNEL_SMS','CHANNEL_INAPP') AND c.granted AND c.withdrawn_at IS NULL) AS has_channel,
              EXISTS (SELECT 1 FROM idn.donor_restriction x WHERE x.donor_profile_id = d.id AND x.lifted_at IS NULL AND (x.until_date IS NULL OR x.until_date >= current_date)) AS restricted,
              EXISTS (SELECT 1 FROM crd.case_donor cd JOIN crd.coordination_case cc ON cc.id = cd.case_id
                       WHERE cd.donor_profile_id = d.id AND cd.status = 'Active' AND cc.request_id <> $1 AND cc.status NOT IN ('Resolved','Closed')) AS active_commitment,
              (SELECT count(*)::int FROM src.invitation i WHERE i.donor_profile_id = d.id AND i.status <> 'Cancelled'
                  AND COALESCE(i.sent_at, i.queued_at, i.created_at) > now() - interval '24 hours') AS invites_24h,
              (SELECT count(*)::int FROM src.invitation i WHERE i.donor_profile_id = d.id AND i.status <> 'Cancelled'
                  AND COALESCE(i.sent_at, i.queued_at, i.created_at) > now() - interval '30 days') AS invites_30d,
              EXISTS (SELECT 1 FROM src.invitation i WHERE i.donor_profile_id = d.id AND i.request_id = $1
                       AND i.status NOT IN ('Expired','Cancelled','Withdrawn')) AS invited_for_request,
              (d.user_id = $3 OR EXISTS (SELECT 1 FROM req.representative_link l JOIN req.blood_request br ON br.patient_id = l.patient_id
                                          WHERE br.id = $1 AND l.user_id = d.user_id AND l.status = 'Active')) AS is_requester,
              (SELECT max(i.responded_at) FROM src.invitation i WHERE i.donor_profile_id = d.id AND i.response = 'Available') AS last_available_at
         FROM idn.donor_profile d
         JOIN idn.app_user u ON u.id = d.user_id
         LEFT JOIN idn.donor_availability a ON a.donor_profile_id = d.id
         CROSS JOIN loc
        WHERE d.deleted_at IS NULL AND d.blood_group IN (SELECT g FROM groups)`,
      [req.id, req.requested_blood_group, req.created_by_user_id],
    );
    return rows.map((r) => ({
      donorProfileId: r.donor_profile_id,
      bloodGroupStatus: r.blood_group_status,
      donorStatus: r.donor_status,
      accountStatus: r.account_status,
      nextContactDate: r.next_contact_date,
      travelRadiusKm: r.travel_radius_km,
      distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      routineAvailable: r.routine_available ?? false,
      urgentAvailable: r.urgent_available ?? false,
      pausedUntil: r.paused_until,
      contactStart: r.contact_start ?? '08:00',
      contactEnd: r.contact_end ?? '21:00',
      contactDays: (r.contact_days ?? 'MON,TUE,WED,THU,FRI,SAT,SUN').split(','),
      hasUrgentConsent: r.has_urgent,
      hasRoutineConsent: r.has_routine,
      hasChannel: r.has_channel,
      restricted: r.restricted,
      activeCommitment: r.active_commitment,
      invites24h: r.invites_24h,
      invites30d: r.invites_30d,
      invitedForRequest: r.invited_for_request,
      isRequester: r.is_requester,
      lastAvailableAt: r.last_available_at,
    }));
  }

  private async waveView(db: Db, waveId: string) {
    const [r] = await db.orm.select().from(matchRun).where(eq(matchRun.id, waveId));
    if (!r) throw new NotFoundException({ code: 'WAVE_NOT_FOUND' });
    const cands = await db.orm
      .select({
        id: matchCandidate.id, donorProfileId: matchCandidate.donorProfileId, included: matchCandidate.included, rank: matchCandidate.rank,
        distanceKmApprox: matchCandidate.distanceKmApprox, reasonCodes: matchCandidate.reasonCodes, deferredUntil: matchCandidate.deferredUntil,
        selectedForInvite: matchCandidate.selectedForInvite,
      })
      .from(matchCandidate)
      .where(eq(matchCandidate.matchRunId, waveId));
    const labels = await donorLabels(db, cands.map((c) => c.donorProfileId));
    const rows = cands
      .map((c) => ({ ...c, donorCode: labels.get(c.donorProfileId)?.donorCode ?? '', bloodGroup: labels.get(c.donorProfileId)?.bloodGroup ?? null }))
      .sort((a, b) => Number(b.included) - Number(a.included) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.donorCode < b.donorCode ? -1 : a.donorCode > b.donorCode ? 1 : 0));
    return {
      id: r.id, requestId: r.requestId, waveNo: r.waveNo, status: r.status, trigger: r.trigger, radiusKm: Number(r.radiusKm),
      waveSize: r.waveSize, evaluated: r.candidatesEvaluated, included: r.candidatesIncluded,
      responseWindowEndsAt: r.responseWindowEndsAt, createdAt: r.createdAt,
      notice: 'This is an outreach recommendation, not a compatibility decision.',
      candidates: rows.map((c) => ({
        id: c.id, donorCode: c.donorCode, bloodGroup: c.bloodGroup, included: c.included, rank: c.rank,
        distanceKmApprox: c.distanceKmApprox === null ? null : Math.round(Number(c.distanceKmApprox) * 10) / 10,
        reasons: c.reasonCodes.map((code) => ({ code, label: REASON_LABELS[code] ?? code })),
        deferredUntil: c.deferredUntil, selected: c.selectedForInvite,
      })),
    };
  }

  private async lockRun(tx: Db, id: string): Promise<typeof matchRun.$inferSelect> {
    const [row] = await tx.orm.select().from(matchRun).where(eq(matchRun.id, id)).for('update');
    if (!row) throw new NotFoundException({ code: 'WAVE_NOT_FOUND' });
    return row;
  }

  private async lockRequest(db: Db, id: string, lock = true): Promise<RequestRow> {
    // Raw SQL: locks the request row while reading facility and area location (ADR-16 rule 6).
    const { rows } = await db.query<RequestRow>(
      `SELECT r.id, r.reference_no, r.status, r.urgency, r.requested_blood_group, r.component, r.required_by, r.area_id, r.outreach_paused,
              r.has_moderation_hold, r.assigned_support_user_id, r.created_by_user_id, r.version,
              (r.location IS NOT NULL OR f.location IS NOT NULL OR a.centroid IS NOT NULL) AS has_location
         FROM req.blood_request r
         LEFT JOIN apt.facility f ON f.id = r.hospital_facility_id
         LEFT JOIN cfg.area a ON a.id = r.area_id
        WHERE r.id = $1 AND r.deleted_at IS NULL ${lock ? 'FOR UPDATE OF r' : ''}`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    return rows[0];
  }

  private async requireStaffAccess(db: Db, principal: Principal, req: RequestRow, key = 'invitation.create') {
    const decision = this.policy.decide(principal, key, {
      resource: { assignedUserIds: req.assigned_support_user_id ? [req.assigned_support_user_id] : [], areaIds: req.area_id ? [req.area_id] : [] },
      principalAreaIds: await staffAreaIds(db, principal.userId),
    });
    if (!decision.allowed) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
  }
}
