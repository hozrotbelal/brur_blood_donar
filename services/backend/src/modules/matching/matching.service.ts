import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { findTransition, requestStateMachine } from '../request/request.public';
import { DonorFacts, REASON_LABELS, SearchParams, Urgency, compareCandidates, evaluateDonor, radiusSteps, responseWindowMinutes } from './matching.rules';

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

interface RunRow {
  id: string;
  request_id: string;
  wave_no: number;
  status: string;
  trigger: string;
  radius_km: string;
  wave_size: number;
  candidates_evaluated: number;
  candidates_included: number;
  approved_by: string | null;
  response_window_ends_at: Date | null;
  created_at: Date;
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
    const { rows } = await db.query<{ key: string; value: unknown }>(
      `SELECT DISTINCT ON (key) key, value FROM cfg.config_setting
        WHERE key = ANY($1::text[]) AND status = 'Active' AND (scope_type IS NULL OR scope_type = 'GLOBAL')
        ORDER BY key, version DESC`,
      [SETTING_KEYS],
    );
    const v = new Map(rows.map((r) => [r.key, r.value]));
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
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT r.id FROM req.blood_request r
        WHERE r.status = 'Verified' AND r.deleted_at IS NULL AND NOT r.outreach_paused AND NOT r.has_moderation_hold
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

  async listWaves(principal: Principal, requestId: string) {
    const req = await this.lockRequest(this.db, requestId, false);
    await this.requireStaffAccess(this.db, principal, req, 'blood_request.view');
    const { rows } = await this.db.query<{ id: string }>('SELECT id FROM src.match_run WHERE request_id = $1 ORDER BY wave_no', [requestId]);
    return Promise.all(rows.map((r) => this.waveView(this.db, r.id)));
  }

  async approveWave(principal: Principal, waveId: string, input: { removeCandidateIds?: string[]; note?: string }) {
    return this.db.transaction(async (tx) => {
      const run = await this.lockRun(tx, waveId);
      const req = await this.lockRequest(tx, run.request_id);
      await this.requireStaffAccess(tx, principal, req);
      if (run.status !== 'Pending approval') {
        if (run.approved_by === principal.userId) return this.waveView(tx, waveId);
        throw fail('WAVE_NOT_AWAITING_APPROVAL', HttpStatus.CONFLICT);
      }
      if (req.outreach_paused || req.has_moderation_hold) throw fail('OUTREACH_PAUSED');
      if (req.status !== 'Searching') throw fail('REQUEST_NOT_SEARCHING');
      const settings = await this.loadSettings(tx);
      if (run.wave_no > settings.maxWaves && !input.note?.trim()) throw fail('REVIEW_NOTE_REQUIRED');

      const remove = input.removeCandidateIds ?? [];
      if (remove.length > 0) {
        const removed = await tx.query(
          `UPDATE src.match_candidate SET selected_for_invite = false WHERE match_run_id = $1 AND id = ANY($2::uuid[]) AND selected_for_invite`,
          [waveId, remove],
        );
        if (removed.rowCount !== new Set(remove).size) throw fail('CANDIDATE_NOT_IN_BATCH');
      }
      const selected = await tx.query<{ id: string; donor_profile_id: string; deferred_until: Date | null }>(
        `SELECT id, donor_profile_id, deferred_until FROM src.match_candidate WHERE match_run_id = $1 AND selected_for_invite ORDER BY rank`,
        [waveId],
      );
      if (selected.rows.length === 0) throw fail('NO_CANDIDATES_SELECTED');

      const windowMin = responseWindowMinutes(req.urgency);
      const payload = {
        requestReference: req.reference_no, hospitalAreaId: req.area_id, bloodGroup: req.requested_blood_group,
        component: req.component, urgency: req.urgency, requiredBy: req.required_by,
      };
      for (const c of selected.rows) {
        await tx.query(
          `INSERT INTO src.invitation (request_id, donor_profile_id, match_run_id, match_candidate_id, status, queued_at, expires_at, payload_snapshot)
           VALUES ($1, $2, $3, $4, 'Queued', COALESCE($5, now()), COALESCE($5, now()) + make_interval(mins => $6), $7::jsonb)`,
          [req.id, c.donor_profile_id, waveId, c.id, c.deferred_until, windowMin, JSON.stringify(payload)],
        );
      }
      await tx.query(
        `UPDATE src.match_run SET status = 'Dispatching', approved_by = $2, response_window_ends_at = now() + make_interval(mins => $3),
                version = version + 1, updated_at = now() WHERE id = $1`,
        [waveId, principal.userId, windowMin],
      );
      await tx.query(
        `UPDATE crd.case_task SET status = 'Done', completed_by = $2, completed_at = now(), version = version + 1, updated_at = now()
          WHERE request_id = $1 AND task_type = 'TK_REVIEW_BATCH' AND status <> 'Done'`,
        [req.id, principal.userId],
      );
      await this.outbox.append(tx, {
        aggregateType: 'MATCH_RUN', aggregateId: waveId, eventType: 'WaveApproved',
        payload: { requestId: req.id, invitations: selected.rows.length },
      });
      return this.waveView(tx, waveId);
    });
  }

  private async createWave(tx: Db, req: RequestRow, trigger: string, actor: string | null): Promise<string> {
    if (req.status !== 'Verified' && req.status !== 'Searching') throw fail('REQUEST_NOT_READY_FOR_SEARCH');
    if (req.outreach_paused || req.has_moderation_hold) throw fail('OUTREACH_PAUSED');
    if (!req.has_location) throw fail('REQUEST_HAS_NO_LOCATION');
    const pending = await tx.query("SELECT 1 FROM src.match_run WHERE request_id = $1 AND status IN ('Pending','Pending approval')", [req.id]);
    if (pending.rows[0]) throw fail('WAVE_AWAITING_APPROVAL', HttpStatus.CONFLICT);

    const settings = await this.loadSettings(tx);
    const last = await tx.query<{ n: number }>('SELECT COALESCE(max(wave_no), 0)::int AS n FROM src.match_run WHERE request_id = $1', [req.id]);
    const waveNo = last.rows[0].n + 1;
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
    const rule = await tx.query<{ v: number | null }>(
      `SELECT max(rule_set_version) AS v FROM src.outreach_group_rule WHERE status = 'Approved'`,
    );
    const facts = await this.loadFacts(tx, req);
    const scored = facts.map((f) => ({ facts: f, result: evaluateDonor(f, params) }));
    const included = scored.filter((s) => s.result.included).sort(compareCandidates);
    const proposed = new Set(included.slice(0, params.waveSize).map((s) => s.facts.donorProfileId));

    await tx.query(
      `UPDATE src.match_run SET status = 'Completed', version = version + 1, updated_at = now()
        WHERE request_id = $1 AND status IN ('Awaiting responses', 'Dispatching', 'Approved')`,
      [req.id],
    );
    const run = await tx.query<{ id: string }>(
      `INSERT INTO src.match_run (request_id, wave_no, status, trigger, mode, radius_km, wave_size, filters_version, group_rule_version,
                                  params_snapshot, candidates_evaluated, candidates_included)
       VALUES ($1, $2, 'Pending approval', $3::match_run_trigger, 'PHASE1_CONTROLLED', $4, $5, 1, $6, $7::jsonb, $8, $9) RETURNING id`,
      [req.id, waveNo, trigger, params.radiusKm, params.waveSize, rule.rows[0].v ?? 0, JSON.stringify({ ...params, now: params.now.toISOString() }), scored.length, included.length],
    );
    const runId = run.rows[0].id;
    let rank = 0;
    for (const s of included) {
      const isProposed = proposed.has(s.facts.donorProfileId);
      await tx.query(
        `INSERT INTO src.match_candidate (match_run_id, donor_profile_id, included, rank, distance_km_approx, reason_codes, deferred_until, selected_for_invite)
         VALUES ($1, $2, true, $3, $4, $5::match_reason_code[], $6, $7)`,
        [runId, s.facts.donorProfileId, ++rank, s.facts.distanceKm, ['RK_DISTANCE_BAND', ...s.result.reasons], s.result.deferredUntil, isProposed],
      );
    }
    for (const s of scored.filter((x) => !x.result.included)) {
      await tx.query(
        `INSERT INTO src.match_candidate (match_run_id, donor_profile_id, included, distance_km_approx, reason_codes)
         VALUES ($1, $2, false, $3, $4::match_reason_code[])`,
        [runId, s.facts.donorProfileId, s.facts.distanceKm, s.result.reasons],
      );
    }
    await tx.query(
      `INSERT INTO crd.case_task (request_id, task_type, status, assignee_user_id, dedupe_key)
       VALUES ($1, 'TK_REVIEW_BATCH', 'Open', $2, $3) ON CONFLICT DO NOTHING`,
      [req.id, req.assigned_support_user_id, `batch:${runId}`],
    );
    if (req.status === 'Verified') await this.startSearching(tx, req, actor);
    await this.outbox.append(tx, {
      aggregateType: 'MATCH_RUN', aggregateId: runId, eventType: 'WaveProposed',
      payload: { requestId: req.id, waveNo, included: included.length, evaluated: scored.length },
    });
    return runId;
  }

  private async startSearching(tx: Db, req: RequestRow, actor: string | null) {
    const t = findTransition('Verified', 'start_search');
    if (!t) throw fail('INVALID_TRANSITION');
    await tx.query(`UPDATE req.blood_request SET status = 'Searching', version = version + 1, updated_at = now() WHERE id = $1`, [req.id]);
    await this.history.record(
      tx,
      {
        entityType: 'BLOOD_REQUEST', entityId: req.id, from: 'Verified', to: 'Searching', actorUserId: actor,
        actorRole: actor ? 'SUP' : 'SYSTEM', source: actor ? 'USER' : 'SYSTEM', contextRequestId: req.id, correlationId: randomUUID(),
      },
      requestStateMachine,
    );
  }

  private async loadFacts(tx: Db, req: RequestRow): Promise<DonorFacts[]> {
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
    const run = await db.query<RunRow>('SELECT * FROM src.match_run WHERE id = $1', [waveId]);
    const r = run.rows[0];
    if (!r) throw new NotFoundException({ code: 'WAVE_NOT_FOUND' });
    const cands = await db.query<{
      id: string; donor_code: string; blood_group: string; included: boolean; rank: number | null; distance_km_approx: string | null;
      reason_codes: string[]; deferred_until: Date | null; selected_for_invite: boolean;
    }>(
      `SELECT c.id, d.donor_code, d.blood_group, c.included, c.rank, c.distance_km_approx, c.reason_codes::text[] AS reason_codes, c.deferred_until, c.selected_for_invite
         FROM src.match_candidate c JOIN idn.donor_profile d ON d.id = c.donor_profile_id
        WHERE c.match_run_id = $1 ORDER BY c.included DESC, c.rank NULLS LAST, d.donor_code`,
      [waveId],
    );
    return {
      id: r.id, requestId: r.request_id, waveNo: r.wave_no, status: r.status, trigger: r.trigger, radiusKm: Number(r.radius_km),
      waveSize: r.wave_size, evaluated: r.candidates_evaluated, included: r.candidates_included,
      responseWindowEndsAt: r.response_window_ends_at, createdAt: r.created_at,
      notice: 'This is an outreach recommendation, not a compatibility decision.',
      candidates: cands.rows.map((c) => ({
        id: c.id, donorCode: c.donor_code, bloodGroup: c.blood_group, included: c.included, rank: c.rank,
        distanceKmApprox: c.distance_km_approx === null ? null : Math.round(Number(c.distance_km_approx) * 10) / 10,
        reasons: c.reason_codes.map((code) => ({ code, label: REASON_LABELS[code] ?? code })),
        deferredUntil: c.deferred_until, selected: c.selected_for_invite,
      })),
    };
  }

  private async lockRun(tx: Db, id: string): Promise<RunRow> {
    const { rows } = await tx.query<RunRow>('SELECT * FROM src.match_run WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'WAVE_NOT_FOUND' });
    return rows[0];
  }

  private async lockRequest(db: Db, id: string, lock = true): Promise<RequestRow> {
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
    const { rows } = await db.query<{ area_id: string }>(
      `SELECT s.area_id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id
        WHERE ur.user_id = $1 AND ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id IS NOT NULL`,
      [principal.userId],
    );
    const decision = this.policy.decide(principal, key, {
      resource: { assignedUserIds: req.assigned_support_user_id ? [req.assigned_support_user_id] : [], areaIds: req.area_id ? [req.area_id] : [] },
      principalAreaIds: rows.map((r) => r.area_id),
    });
    if (!decision.allowed) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
  }
}
