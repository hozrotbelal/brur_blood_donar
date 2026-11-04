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
exports.MatchingService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const area_scope_1 = require("../../platform/policy/area-scope");
const policy_service_1 = require("../../platform/policy/policy.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const case_workflow_public_1 = require("../case-workflow/case-workflow.public");
const read_model_public_1 = require("../configuration/read-model.public");
const read_model_public_2 = require("../identity/read-model.public");
const request_public_1 = require("../request/request.public");
const matching_rules_1 = require("./matching.rules");
const schema_1 = require("./schema");
const DEFAULTS = {
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
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
let MatchingService = class MatchingService {
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
    async loadSettings(db) {
        const v = await (0, read_model_public_1.activeGlobalSettings)(db, SETTING_KEYS);
        const num = (k, d) => (typeof v.get(k) === 'number' ? v.get(k) : d);
        const bool = (k, d) => (typeof v.get(k) === 'boolean' ? v.get(k) : d);
        const steps = v.get('search.radius_steps_km');
        return {
            waveSizeDefault: num('search.wave_size.default', DEFAULTS.waveSizeDefault),
            waveSizeCritical: num('search.wave_size.critical', DEFAULTS.waveSizeCritical),
            radiusStepsKm: Array.isArray(steps) && steps.every((s) => typeof s === 'number') && steps.length > 0 ? steps : DEFAULTS.radiusStepsKm,
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
    async expandSearch(principal, requestId) {
        return this.db.transaction(async (tx) => {
            const req = await this.lockRequest(tx, requestId);
            await this.requireStaffAccess(tx, principal, req);
            const waveId = await this.createWave(tx, req, 'SUPPORT_EXPANDED', principal.userId);
            return this.waveView(tx, waveId);
        });
    }
    async startSearch(requestId) {
        return this.db.transaction(async (tx) => {
            const req = await this.lockRequest(tx, requestId);
            if (req.status !== 'Verified')
                return null;
            return this.createWave(tx, req, 'AUTO_ON_VERIFIED', null);
        });
    }
    async startPendingSearches() {
        // Raw SQL: cross-module read of request and case state (ADR-16 rule 6).
        const { rows } = await this.db.query(`SELECT r.id FROM req.blood_request r
         LEFT JOIN apt.facility f ON f.id = r.hospital_facility_id
         LEFT JOIN cfg.area a ON a.id = r.area_id
        WHERE r.status = 'Verified' AND r.deleted_at IS NULL AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          AND (r.location IS NOT NULL OR f.location IS NOT NULL OR a.centroid IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM src.match_run m WHERE m.request_id = r.id) ORDER BY r.verified_at LIMIT 20`);
        let started = 0;
        for (const r of rows) {
            try {
                if (await this.startSearch(r.id))
                    started++;
            }
            catch (error) {
                if (!(error instanceof common_1.HttpException))
                    throw error;
            }
        }
        return started;
    }
    async proposeNextWaves() {
        // Raw SQL: cross-module read of request and case state (ADR-16 rule 6).
        const { rows } = await this.db.query(`SELECT DISTINCT m.request_id FROM src.match_run m JOIN req.blood_request r ON r.id = m.request_id
        WHERE m.status = 'Awaiting responses' AND m.response_window_ends_at <= now() AND r.status = 'Searching'
          AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          AND NOT EXISTS (SELECT 1 FROM src.match_run n WHERE n.request_id = m.request_id AND n.status IN ('Pending','Pending approval','Approved','Dispatching'))`);
        let proposed = 0;
        for (const row of rows) {
            try {
                await this.db.transaction(async (tx) => {
                    const req = await this.lockRequest(tx, row.request_id);
                    if (req.status !== 'Searching')
                        return;
                    await this.createWave(tx, req, 'AUTO_NEXT_WAVE', null);
                    proposed++;
                });
            }
            catch (error) {
                if (!(error instanceof common_1.HttpException))
                    throw error;
            }
        }
        return proposed;
    }
    async proposeReplacementWaves() {
        // Raw SQL: cross-module read of request and case state (ADR-16 rule 6).
        const { rows } = await this.db.query(`SELECT DISTINCT r.id AS request_id FROM req.blood_request r
         JOIN crd.coordination_case c ON c.request_id = r.id AND c.status = 'Needs replacement'
        WHERE r.status = 'Searching' AND r.deleted_at IS NULL AND NOT r.outreach_paused AND NOT r.has_moderation_hold
          AND NOT EXISTS (SELECT 1 FROM src.match_run n WHERE n.request_id = r.id AND n.status IN ('Pending','Pending approval','Approved','Dispatching'))
          AND NOT EXISTS (SELECT 1 FROM src.match_run n WHERE n.request_id = r.id AND n.trigger = 'REPLACEMENT' AND n.created_at >= c.updated_at)
        LIMIT 20`);
        let proposed = 0;
        for (const row of rows) {
            try {
                await this.db.transaction(async (tx) => {
                    const req = await this.lockRequest(tx, row.request_id);
                    if (req.status !== 'Searching')
                        return;
                    await this.createWave(tx, req, 'REPLACEMENT', null);
                    proposed++;
                });
            }
            catch (error) {
                if (!(error instanceof common_1.HttpException))
                    throw error;
            }
        }
        return proposed;
    }
    async recheckAfterChange(requestId) {
        return this.db.transaction(async (tx) => {
            const req = await this.lockRequest(tx, requestId);
            if (!['Verified', 'Searching', 'Donor coordination'].includes(req.status))
                return { cancelled: 0, waveId: null };
            const correlationId = (0, node_crypto_1.randomUUID)();
            const open = await tx.orm
                .select({ id: schema_1.invitation.id, status: schema_1.invitation.status })
                .from(schema_1.invitation)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invitation.requestId, req.id), (0, drizzle_orm_1.inArray)(schema_1.invitation.status, ['Queued', 'Sent', 'Delivered', 'Viewed'])))
                .for('update');
            for (const inv of open) {
                await tx.orm
                    .update(schema_1.invitation)
                    .set({ status: 'Cancelled', cancelReason: 'REQUEST_CHANGED', cancelledAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.invitation.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                    .where((0, drizzle_orm_1.eq)(schema_1.invitation.id, inv.id));
                await this.history.record(tx, {
                    entityType: 'INVITATION', entityId: inv.id, from: inv.status, to: 'Cancelled', actorUserId: null, actorRole: 'SYSTEM',
                    source: 'SYSTEM', contextRequestId: req.id, reasonCode: 'REQUEST_CHANGED', correlationId,
                });
            }
            const stale = await tx.orm
                .select({ id: schema_1.matchRun.id, status: schema_1.matchRun.status })
                .from(schema_1.matchRun)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.matchRun.requestId, req.id), (0, drizzle_orm_1.inArray)(schema_1.matchRun.status, ['Pending', 'Pending approval'])))
                .for('update');
            for (const run of stale) {
                await tx.orm
                    .update(schema_1.matchRun)
                    .set({ status: 'Superseded', version: (0, drizzle_orm_1.sql) `${schema_1.matchRun.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                    .where((0, drizzle_orm_1.eq)(schema_1.matchRun.id, run.id));
                await this.history.record(tx, {
                    entityType: 'MATCH_RUN', entityId: run.id, from: run.status, to: 'Superseded', actorUserId: null, actorRole: 'SYSTEM',
                    source: 'SYSTEM', contextRequestId: req.id, reasonCode: 'REQUEST_CHANGED', correlationId,
                });
                await (0, case_workflow_public_1.cancelBatchReviewTask)(tx, run.id);
            }
            if (open.length > 0) {
                await this.outbox.append(tx, {
                    aggregateType: 'BLOOD_REQUEST', aggregateId: req.id, eventType: 'InvitationsCancelled',
                    payload: { invitationIds: open.map((r) => r.id), reason: 'REQUEST_CHANGED' },
                    version: req.version,
                });
            }
            let waveId = null;
            if (req.status === 'Searching' && !req.outreach_paused && !req.has_moderation_hold && req.has_location) {
                waveId = await this.createWave(tx, req, 'MANUAL', null);
            }
            return { cancelled: open.length, waveId };
        });
    }
    async listWaves(principal, requestId) {
        const req = await this.lockRequest(this.db, requestId, false);
        await this.requireStaffAccess(this.db, principal, req, 'blood_request.view');
        const rows = await this.db.orm.select({ id: schema_1.matchRun.id }).from(schema_1.matchRun).where((0, drizzle_orm_1.eq)(schema_1.matchRun.requestId, requestId)).orderBy((0, drizzle_orm_1.asc)(schema_1.matchRun.waveNo));
        return Promise.all(rows.map((r) => this.waveView(this.db, r.id)));
    }
    async approveWave(principal, waveId, input) {
        return this.db.transaction(async (tx) => {
            const run = await this.lockRun(tx, waveId);
            const req = await this.lockRequest(tx, run.requestId);
            await this.requireStaffAccess(tx, principal, req);
            if (run.status !== 'Pending approval') {
                if (run.approvedBy === principal.userId)
                    return this.waveView(tx, waveId);
                throw fail('WAVE_NOT_AWAITING_APPROVAL', common_1.HttpStatus.CONFLICT);
            }
            if (req.outreach_paused || req.has_moderation_hold)
                throw fail('OUTREACH_PAUSED');
            if (req.status !== 'Searching')
                throw fail('REQUEST_NOT_SEARCHING');
            const settings = await this.loadSettings(tx);
            if (run.waveNo > settings.maxWaves && !input.note?.trim())
                throw fail('REVIEW_NOTE_REQUIRED');
            const remove = input.removeCandidateIds ?? [];
            if (remove.length > 0) {
                const removed = await tx.orm
                    .update(schema_1.matchCandidate)
                    .set({ selectedForInvite: false })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.matchCandidate.matchRunId, waveId), (0, drizzle_orm_1.inArray)(schema_1.matchCandidate.id, remove), (0, drizzle_orm_1.eq)(schema_1.matchCandidate.selectedForInvite, true)))
                    .returning({ id: schema_1.matchCandidate.id });
                if (removed.length !== new Set(remove).size)
                    throw fail('CANDIDATE_NOT_IN_BATCH');
            }
            const selected = await tx.orm
                .select({ id: schema_1.matchCandidate.id, donorProfileId: schema_1.matchCandidate.donorProfileId, deferredUntil: schema_1.matchCandidate.deferredUntil })
                .from(schema_1.matchCandidate)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.matchCandidate.matchRunId, waveId), (0, drizzle_orm_1.eq)(schema_1.matchCandidate.selectedForInvite, true)))
                .orderBy((0, drizzle_orm_1.asc)(schema_1.matchCandidate.rank));
            if (selected.length === 0)
                throw fail('NO_CANDIDATES_SELECTED');
            const windowMin = (0, matching_rules_1.responseWindowMinutes)(req.urgency);
            const payload = {
                requestReference: req.reference_no, hospitalAreaId: req.area_id, bloodGroup: req.requested_blood_group,
                component: req.component, urgency: req.urgency, requiredBy: req.required_by,
            };
            await tx.orm.insert(schema_1.invitation).values(selected.map((c) => ({
                requestId: req.id, donorProfileId: c.donorProfileId, matchRunId: waveId, matchCandidateId: c.id, status: 'Queued',
                queuedAt: c.deferredUntil ?? (0, drizzle_orm_1.sql) `now()`,
                expiresAt: c.deferredUntil ? new Date(c.deferredUntil.getTime() + windowMin * 60_000) : (0, drizzle_orm_1.sql) `now() + make_interval(mins => ${windowMin}::int)`,
                payloadSnapshot: payload,
            })));
            await tx.orm
                .update(schema_1.matchRun)
                .set({
                status: 'Dispatching', approvedBy: principal.userId, responseWindowEndsAt: (0, drizzle_orm_1.sql) `now() + make_interval(mins => ${windowMin}::int)`,
                version: (0, drizzle_orm_1.sql) `${schema_1.matchRun.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()`,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.matchRun.id, waveId));
            await (0, case_workflow_public_1.completeBatchReviewTasks)(tx, req.id, principal.userId);
            await this.outbox.append(tx, {
                aggregateType: 'MATCH_RUN', aggregateId: waveId, eventType: 'WaveApproved',
                payload: { requestId: req.id, invitations: selected.length },
            });
            return this.waveView(tx, waveId);
        });
    }
    async createWave(tx, req, trigger, actor) {
        if (req.status !== 'Verified' && req.status !== 'Searching')
            throw fail('REQUEST_NOT_READY_FOR_SEARCH');
        if (req.outreach_paused || req.has_moderation_hold)
            throw fail('OUTREACH_PAUSED');
        if (!req.has_location)
            throw fail('REQUEST_HAS_NO_LOCATION');
        const [pending] = await tx.orm
            .select({ id: schema_1.matchRun.id })
            .from(schema_1.matchRun)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.matchRun.requestId, req.id), (0, drizzle_orm_1.inArray)(schema_1.matchRun.status, ['Pending', 'Pending approval'])))
            .limit(1);
        if (pending)
            throw fail('WAVE_AWAITING_APPROVAL', common_1.HttpStatus.CONFLICT);
        const settings = await this.loadSettings(tx);
        const [last] = await tx.orm.select({ n: (0, drizzle_orm_1.max)(schema_1.matchRun.waveNo) }).from(schema_1.matchRun).where((0, drizzle_orm_1.eq)(schema_1.matchRun.requestId, req.id));
        const waveNo = (last?.n ?? 0) + 1;
        const params = {
            urgency: req.urgency,
            radiusKm: (0, matching_rules_1.radiusSteps)(settings.radiusStepsKm, waveNo),
            waveSize: req.urgency === 'Critical' ? settings.waveSizeCritical : settings.waveSizeDefault,
            requireVerifiedGroup: settings.requireVerifiedGroup[req.urgency],
            maxInvitesPer24h: settings.maxInvitesPer24h,
            maxInvitesPer30d: settings.maxInvitesPer30d,
            criticalBypassContactHours: settings.criticalBypassContactHours,
            now: new Date(),
        };
        const [rule] = await tx.orm.select({ v: (0, drizzle_orm_1.max)(schema_1.outreachGroupRule.ruleSetVersion) }).from(schema_1.outreachGroupRule).where((0, drizzle_orm_1.eq)(schema_1.outreachGroupRule.status, 'Approved'));
        const facts = await this.loadFacts(tx, req);
        const scored = facts.map((f) => ({ facts: f, result: (0, matching_rules_1.evaluateDonor)(f, params) }));
        const included = scored.filter((s) => s.result.included).sort(matching_rules_1.compareCandidates);
        const proposed = new Set(included.slice(0, params.waveSize).map((s) => s.facts.donorProfileId));
        await tx.orm
            .update(schema_1.matchRun)
            .set({ status: 'Completed', version: (0, drizzle_orm_1.sql) `${schema_1.matchRun.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.matchRun.requestId, req.id), (0, drizzle_orm_1.inArray)(schema_1.matchRun.status, ['Awaiting responses', 'Dispatching', 'Approved'])));
        const [run] = await tx.orm
            .insert(schema_1.matchRun)
            .values({
            requestId: req.id, waveNo, status: 'Pending approval', trigger, mode: 'PHASE1_CONTROLLED', radiusKm: String(params.radiusKm), waveSize: params.waveSize,
            filtersVersion: 1, groupRuleVersion: rule?.v ?? 0, paramsSnapshot: { ...params, now: params.now.toISOString() },
            candidatesEvaluated: scored.length, candidatesIncluded: included.length,
        })
            .returning({ id: schema_1.matchRun.id });
        const distance = (km) => (km === null ? null : String(km));
        const candidates = [
            ...included.map((s, i) => ({
                matchRunId: run.id, donorProfileId: s.facts.donorProfileId, included: true, rank: i + 1, distanceKmApprox: distance(s.facts.distanceKm),
                reasonCodes: ['RK_DISTANCE_BAND', ...s.result.reasons], deferredUntil: s.result.deferredUntil, selectedForInvite: proposed.has(s.facts.donorProfileId),
            })),
            ...scored.filter((x) => !x.result.included).map((s) => ({
                matchRunId: run.id, donorProfileId: s.facts.donorProfileId, included: false, distanceKmApprox: distance(s.facts.distanceKm), reasonCodes: s.result.reasons,
            })),
        ];
        if (candidates.length > 0)
            await tx.orm.insert(schema_1.matchCandidate).values(candidates);
        await (0, case_workflow_public_1.openBatchReviewTask)(tx, req.id, run.id, req.assigned_support_user_id);
        if (req.status === 'Verified')
            await (0, request_public_1.markSearching)(tx, this.history, req.id, actor);
        await this.outbox.append(tx, {
            aggregateType: 'MATCH_RUN', aggregateId: run.id, eventType: 'WaveProposed',
            payload: { requestId: req.id, waveNo, included: included.length, evaluated: scored.length },
        });
        return run.id;
    }
    async loadFacts(tx, req) {
        // Raw SQL: PostGIS distance and cross-module donor facts (ADR-16 rule 6).
        const { rows } = await tx.query(`WITH loc AS (
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
        WHERE d.deleted_at IS NULL AND d.blood_group IN (SELECT g FROM groups)`, [req.id, req.requested_blood_group, req.created_by_user_id]);
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
    async waveView(db, waveId) {
        const [r] = await db.orm.select().from(schema_1.matchRun).where((0, drizzle_orm_1.eq)(schema_1.matchRun.id, waveId));
        if (!r)
            throw new common_1.NotFoundException({ code: 'WAVE_NOT_FOUND' });
        const cands = await db.orm
            .select({
            id: schema_1.matchCandidate.id, donorProfileId: schema_1.matchCandidate.donorProfileId, included: schema_1.matchCandidate.included, rank: schema_1.matchCandidate.rank,
            distanceKmApprox: schema_1.matchCandidate.distanceKmApprox, reasonCodes: schema_1.matchCandidate.reasonCodes, deferredUntil: schema_1.matchCandidate.deferredUntil,
            selectedForInvite: schema_1.matchCandidate.selectedForInvite,
        })
            .from(schema_1.matchCandidate)
            .where((0, drizzle_orm_1.eq)(schema_1.matchCandidate.matchRunId, waveId));
        const labels = await (0, read_model_public_2.donorLabels)(db, cands.map((c) => c.donorProfileId));
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
                reasons: c.reasonCodes.map((code) => ({ code, label: matching_rules_1.REASON_LABELS[code] ?? code })),
                deferredUntil: c.deferredUntil, selected: c.selectedForInvite,
            })),
        };
    }
    async lockRun(tx, id) {
        const [row] = await tx.orm.select().from(schema_1.matchRun).where((0, drizzle_orm_1.eq)(schema_1.matchRun.id, id)).for('update');
        if (!row)
            throw new common_1.NotFoundException({ code: 'WAVE_NOT_FOUND' });
        return row;
    }
    async lockRequest(db, id, lock = true) {
        // Raw SQL: locks the request row while reading facility and area location (ADR-16 rule 6).
        const { rows } = await db.query(`SELECT r.id, r.reference_no, r.status, r.urgency, r.requested_blood_group, r.component, r.required_by, r.area_id, r.outreach_paused,
              r.has_moderation_hold, r.assigned_support_user_id, r.created_by_user_id, r.version,
              (r.location IS NOT NULL OR f.location IS NOT NULL OR a.centroid IS NOT NULL) AS has_location
         FROM req.blood_request r
         LEFT JOIN apt.facility f ON f.id = r.hospital_facility_id
         LEFT JOIN cfg.area a ON a.id = r.area_id
        WHERE r.id = $1 AND r.deleted_at IS NULL ${lock ? 'FOR UPDATE OF r' : ''}`, [id]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
        return rows[0];
    }
    async requireStaffAccess(db, principal, req, key = 'invitation.create') {
        const decision = this.policy.decide(principal, key, {
            resource: { assignedUserIds: req.assigned_support_user_id ? [req.assigned_support_user_id] : [], areaIds: req.area_id ? [req.area_id] : [] },
            principalAreaIds: await (0, area_scope_1.staffAreaIds)(db, principal.userId),
        });
        if (!decision.allowed)
            throw new common_1.NotFoundException({ code: 'REQUEST_NOT_FOUND' });
    }
};
exports.MatchingService = MatchingService;
exports.MatchingService = MatchingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        policy_service_1.PolicyService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService])
], MatchingService);
//# sourceMappingURL=matching.service.js.map