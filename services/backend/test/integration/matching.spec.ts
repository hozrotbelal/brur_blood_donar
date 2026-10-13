import { randomUUID } from 'node:crypto';
import { AuditService } from '../../src/platform/audit/audit.service';
import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { PolicyService } from '../../src/platform/policy/policy.service';
import { Principal } from '../../src/platform/policy/policy.types';
import { StatusHistoryService } from '../../src/platform/status/status-history.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import { DonorService } from '../../src/modules/identity/donor.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SmsSender } from '../../src/modules/identity/sms.port';
import { TokenService } from '../../src/modules/identity/token.service';
import { RequestService } from '../../src/modules/request/request.service';
import { ReviewService } from '../../src/modules/request/review.service';
import { InvitationService } from '../../src/modules/matching/invitation.service';
import { CaseService } from '../../src/modules/case-workflow/case.service';
import { CaseSupport } from '../../src/modules/case-workflow/case.support';
import { MatchingService } from '../../src/modules/matching/matching.service';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const checklist = {
  documentLegible: true, bloodGroupAndComponentMatch: true, facilityExists: true,
  representativeReachable: true, noDuplicate: true, urgencyConsistent: true,
};
const consent = { granted: true, policyVersion: 'v1', language: 'bn' as const };

class CapturingSms extends SmsSender {
  last = '';
  send(_phone: string, text: string) {
    this.last = /(\d{6})/.exec(text)![1];
    return Promise.resolve();
  }
}

suite('matching and invitations (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let donors: DonorService;
  let requests: RequestService;
  let review: ReviewService;
  let matching: MatchingService;
  let invitations: InvitationService;
  const sms = new CapturingSms();
  let origin = { lon: 90.41, lat: 23.81 };
  const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  async function newUser(role: 'DON' | 'PAT'): Promise<Principal> {
    const p = phone();
    const { challengeId } = await auth.register({ phone: p, role, language: 'bn' });
    const { setupToken } = await auth.verifyOtp({ challengeId, code: sms.last, role, language: 'bn' });
    await auth.setPassword({
      setupToken, password: 'correct horse battery',
      device: { installId: randomUUID(), platform: 'android', model: 'T', osVersion: '14', appVersion: '1' },
    });
    const row = await db.query<{ id: string }>('SELECT id FROM idn.app_user WHERE phone_e164 = $1', [`+880${p.slice(1)}`]);
    return { userId: row.rows[0].id, role, grants: await auth.loadGrants(row.rows[0].id, role) };
  }

  async function newDonor(opts: { group?: 'O+' | 'A+'; km?: number; urgentConsent?: boolean } = {}) {
    const user = await newUser('DON');
    await donors.saveProfile(user, { bloodGroup: opts.group ?? 'O+' });
    if (opts.urgentConsent !== false) await donors.saveConsent(user, 'URGENT_INVITATIONS', consent);
    await donors.saveConsent(user, 'CHANNEL_PUSH', consent);
    await donors.saveAvailability(user, {
      routineAvailable: true, urgentAvailable: true, contactStart: '00:00', contactEnd: '23:59',
      contactDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    });
    const km = opts.km ?? 2;
    await db.query(
      `UPDATE idn.donor_profile SET approx_location = ST_SetSRID(ST_MakePoint($3::float + $2::float / 111.0, $4::float), 4326)::geography WHERE user_id = $1`,
      [user.userId, km, origin.lon, origin.lat],
    );
    const code = await db.query<{ id: string; donor_code: string }>('SELECT id, donor_code FROM idn.donor_profile WHERE user_id = $1', [user.userId]);
    return { user, profileId: code.rows[0].id, code: code.rows[0].donor_code };
  }

  async function newAgent(areaId: string): Promise<Principal> {
    const u = await db.query<{ id: string }>(
      `INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), true) RETURNING id`,
      [`+880${phone().slice(1)}`],
    );
    const userId = u.rows[0].id;
    const ur = await db.query<{ id: string }>(
      `INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = 'SUP' RETURNING id`,
      [userId],
    );
    await db.query(`INSERT INTO idn.permission_scope (user_role_id, scope_code, area_id, granted_by) VALUES ($1, 'scope.area', $2, $3)`, [ur.rows[0].id, areaId, userId]);
    await db.query(
      `INSERT INTO idn.user_permission_set (user_id, permission_set_id, status, effective_from)
       SELECT $1, id, 'Active', now() FROM idn.permission_set WHERE code = 'TIER_SUPPORT_AGENT'`,
      [userId],
    );
    return { userId, role: 'SUP', grants: await auth.loadGrants(userId, 'SUP') };
  }

  async function verifiedRequest(urgency: 'Routine' | 'Urgent' | 'Critical' = 'Urgent') {
    const area = await db.query<{ id: string }>(
      `INSERT INTO cfg.area (level, code, name_en, name_bn, centroid, is_active)
       VALUES ('DISTRICT', $1, 'Test', 'পরীক্ষা', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, true) RETURNING id`,
      [`T-${randomUUID()}`, origin.lon, origin.lat],
    );
    const areaId = area.rows[0].id;
    const patientUser = await newUser('PAT');
    const agent = await newAgent(areaId);
    const patient = await requests.createPatient(patientUser, { displayName: 'Test Patient', relationship: 'PARENT' });
    const draft = await requests.createRequest(patientUser, {
      patientId: patient.id, requestedBloodGroup: 'O+', component: 'WHOLE_BLOOD', quantityUnits: 1,
      requiredBy: new Date(Date.now() + 86_400_000).toISOString(), urgency, contactPhone: `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, areaId,
    });
    const submitted = await requests.submit(patientUser, draft.id);
    await review.pickUp(agent, submitted.id);
    await review.verify(agent, submitted.id, checklist);
    return { requestId: submitted.id, agent, areaId, patientUser };
  }

  beforeEach(() => {
    origin = { lon: 88.2 + Math.random() * 4.2, lat: 21 + Math.random() * 5 };
  });

  beforeAll(() => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
    const tokens = new TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' } as AppConfig);
    const outbox = new OutboxService();
    const audit = new AuditService(outbox);
    const history = new StatusHistoryService(audit);
    const policy = new PolicyService();
    auth = new AuthService(db, new PasswordService(), tokens, sms, outbox, audit);
    donors = new DonorService(db, history, outbox);
    requests = new RequestService(db, policy, history, outbox);
    review = new ReviewService(db, policy, history, outbox);
    matching = new MatchingService(db, policy, history, outbox);
    invitations = new InvitationService(db, history, outbox, new CaseService(db, new CaseSupport(policy, history, outbox), history));
  });
  afterAll(() => db.onModuleDestroy());

  it('proposes a ranked batch with plain reasons, moves the request to Searching, and leaves group mismatches out', async () => {
    const near = await newDonor({ km: 1 });
    const nearer = await newDonor({ km: 0.5 });
    const far = await newDonor({ km: 30 });
    const noConsent = await newDonor({ urgentConsent: false });
    const wrongGroup = await newDonor({ group: 'A+' });
    const { requestId, agent } = await verifiedRequest();

    const waveId = (await matching.startSearch(requestId))!;
    const status = await db.query('SELECT status FROM req.blood_request WHERE id = $1', [requestId]);
    expect(status.rows[0].status).toBe('Searching');

    const waves = await matching.listWaves(agent, requestId);
    expect(waves).toHaveLength(1);
    const wave = waves[0];
    expect(wave).toMatchObject({ id: waveId, waveNo: 1, status: 'Pending approval', radiusKm: 5 });
    expect(wave.notice).toMatch(/not a compatibility decision/);
    const byCode = new Map(wave.candidates.map((c) => [c.donorCode, c]));
    expect(byCode.get(nearer.code)).toMatchObject({ included: true, selected: true });
    expect(byCode.get(near.code)).toMatchObject({ included: true, selected: true });
    expect([nearer, near].map((d) => byCode.get(d.code)!.rank).sort()).toEqual([1, 2]);
    expect(byCode.get(far.code)?.reasons.map((r) => r.code)).toEqual(['EX_OUTSIDE_TRAVEL_RADIUS']);
    expect(byCode.get(far.code)?.reasons[0].label).toMatch(/too far/i);
    expect(byCode.get(noConsent.code)?.reasons.map((r) => r.code)).toContain('EX_NO_CONSENT');
    expect(byCode.has(wrongGroup.code)).toBe(false);
    const task = await db.query(`SELECT status FROM crd.case_task WHERE request_id = $1 AND task_type = 'TK_REVIEW_BATCH'`, [requestId]);
    expect(task.rows).toEqual([{ status: 'Open' }]);
    await expect(matching.expandSearch(agent, requestId)).rejects.toMatchObject({ status: 409 });
  });

  it('approves once, drops removed candidates, and creates exactly one invitation per donor', async () => {
    const a = await newDonor({ km: 1 });
    const b = await newDonor({ km: 2 });
    const { requestId, agent } = await verifiedRequest();
    const waveId = (await matching.startSearch(requestId))!;
    const wave = (await matching.listWaves(agent, requestId))[0];
    const bCandidate = wave.candidates.find((c) => c.donorCode === b.code)!;

    const approved = await matching.approveWave(agent, waveId, { removeCandidateIds: [bCandidate.id] });
    expect(approved.status).toBe('Dispatching');
    const again = await matching.approveWave(agent, waveId, { removeCandidateIds: [bCandidate.id] });
    expect(again.id).toBe(waveId);

    const rows = await db.query(`SELECT donor_profile_id, status FROM src.invitation WHERE request_id = $1`, [requestId]);
    expect(rows.rows.map((r) => r.donor_profile_id)).toEqual([a.profileId]);
    expect(rows.rows[0].status).toBe('Queued');
    const payload = await db.query('SELECT payload_snapshot FROM src.invitation WHERE request_id = $1', [requestId]);
    expect(Object.keys(payload.rows[0].payload_snapshot).sort()).toEqual(
      ['bloodGroup', 'component', 'hospitalAreaId', 'requestReference', 'requiredBy', 'urgency'],
    );
    const task = await db.query(`SELECT status FROM crd.case_task WHERE request_id = $1 AND task_type = 'TK_REVIEW_BATCH'`, [requestId]);
    expect(task.rows[0].status).toBe('Done');

    const other = await verifiedRequest();
    await expect(matching.approveWave(other.agent, waveId, {})).rejects.toMatchObject({ status: 404 });
  });

  it('dispatches, lets the donor view and answer, and starts coordination on the first Available', async () => {
    const donor = await newDonor({ km: 1 });
    const { requestId, agent } = await verifiedRequest();
    const waveId = (await matching.startSearch(requestId))!;
    await matching.approveWave(agent, waveId, {});

    expect(await invitations.dispatchDue(1000)).toBeGreaterThanOrEqual(1);
    const list = await invitations.list(donor.user);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'Sent' });
    const opened = await invitations.open(donor.user, list[0].id);
    expect(opened.status).toBe('Viewed');
    expect(opened.details).toMatchObject({ urgency: 'Urgent', bloodGroup: 'O+' });
    expect(JSON.stringify(opened)).not.toMatch(/phone|patient|name/i);

    const mutation = randomUUID();
    const answered = await invitations.respond(donor.user, list[0].id, { response: 'Available', clientMutationId: mutation });
    expect(answered).toMatchObject({ status: 'Responded', response: 'Available' });
    await invitations.respond(donor.user, list[0].id, { response: 'Available', clientMutationId: mutation });
    const count = await db.query('SELECT count(*)::int AS n FROM src.invitation_response WHERE invitation_id = $1', [list[0].id]);
    expect(count.rows[0].n).toBe(1);
    await expect(invitations.respond(donor.user, list[0].id, { response: 'Unavailable' })).rejects.toMatchObject({ status: 410 });

    const request = await db.query('SELECT status, first_invited_at, first_willing_at FROM req.blood_request WHERE id = $1', [requestId]);
    expect(request.rows[0].status).toBe('Donor coordination');
    expect(request.rows[0].first_invited_at).not.toBeNull();
    expect(request.rows[0].first_willing_at).not.toBeNull();
    const runStatus = await db.query('SELECT status FROM src.match_run WHERE id = $1', [waveId]);
    expect(runStatus.rows[0].status).toBe('Awaiting responses');

    const stranger = await newDonor();
    await expect(invitations.open(stranger.user, list[0].id)).rejects.toMatchObject({ status: 404 });
  });

  it('needs a time for Later, and expires unanswered invitations', async () => {
    const donor = await newDonor({ km: 1 });
    const { requestId, agent } = await verifiedRequest('Critical');
    const waveId = (await matching.startSearch(requestId))!;
    await matching.approveWave(agent, waveId, {});
    await invitations.dispatchDue(1000);
    const [inv] = await invitations.list(donor.user);

    await expect(invitations.respond(donor.user, inv.id, { response: 'Later' })).rejects.toMatchObject({ response: { code: 'LATER_TIME_REQUIRED' } });
    await db.query(`UPDATE src.invitation SET expires_at = now() - interval '1 minute' WHERE id = $1`, [inv.id]);
    await expect(invitations.respond(donor.user, inv.id, { response: 'Available' })).rejects.toMatchObject({ status: 410 });
    expect(await invitations.expireDue(1000)).toBeGreaterThanOrEqual(1);
    const [after] = await invitations.list(donor.user);
    expect(after).toMatchObject({ status: 'Expired', details: null });
  });

  it('re-asks a donor once after the Later time, and not for a paused or finished request', async () => {
    const donor = await newDonor({ km: 1 });
    const { requestId, agent } = await verifiedRequest();
    const waveId = (await matching.startSearch(requestId))!;
    await matching.approveWave(agent, waveId, {});
    await invitations.dispatchDue(1000);
    const [inv] = await invitations.list(donor.user);
    await invitations.respond(donor.user, inv.id, { response: 'Later', laterAvailableAt: new Date(Date.now() + 3600_000).toISOString() });

    await invitations.reaskDue(1000);
    expect((await invitations.list(donor.user))[0].status).toBe('Responded');

    await db.query(`UPDATE src.invitation SET later_recheck_at = now() - interval '1 minute' WHERE id = $1`, [inv.id]);
    await db.query(`UPDATE req.blood_request SET outreach_paused = true, outreach_paused_reason = 'test' WHERE id = $1`, [requestId]);
    await invitations.reaskDue(1000);
    expect((await invitations.list(donor.user))[0].status).toBe('Responded');
    await db.query(`UPDATE req.blood_request SET outreach_paused = false, outreach_paused_reason = NULL WHERE id = $1`, [requestId]);

    expect(await invitations.reaskDue(1000)).toBeGreaterThanOrEqual(1);
    const row = await db.query(`SELECT status::text AS status, reask_count, response FROM src.invitation WHERE id = $1`, [inv.id]);
    expect(row.rows[0]).toMatchObject({ status: 'Sent', reask_count: 1, response: null });

    await invitations.respond(donor.user, inv.id, { response: 'Later', laterAvailableAt: new Date(Date.now() + 3600_000).toISOString() });
    await db.query(`UPDATE src.invitation SET later_recheck_at = now() - interval '1 minute' WHERE id = $1`, [inv.id]);
    await invitations.reaskDue(1000);
    expect((await db.query(`SELECT status::text AS status FROM src.invitation WHERE id = $1`, [inv.id])).rows[0].status).toBe('Responded');
  });

  it('keeps invitations queued until a deferred send time, and never re-invites the same donor', async () => {
    const donor = await newDonor({ km: 1 });
    const { requestId, agent } = await verifiedRequest();
    const waveId = (await matching.startSearch(requestId))!;
    await matching.approveWave(agent, waveId, {});
    await db.query(`UPDATE src.invitation SET queued_at = now() + interval '3 hours' WHERE request_id = $1`, [requestId]);
    await invitations.dispatchDue(1000);
    const row = await db.query('SELECT status FROM src.invitation WHERE request_id = $1', [requestId]);
    expect(row.rows[0].status).toBe('Queued');
    expect(await invitations.list(donor.user)).toHaveLength(0);

    await db.query(`UPDATE src.match_run SET status = 'Awaiting responses', response_window_ends_at = now() - interval '1 minute' WHERE id = $1`, [waveId]);
    await matching.proposeNextWaves();
    const waves = await matching.listWaves(agent, requestId);
    expect(waves).toHaveLength(2);
    expect(waves[1]).toMatchObject({ waveNo: 2, radiusKm: 10, trigger: 'AUTO_NEXT_WAVE' });
    expect(waves[1].candidates.find((c) => c.donorCode === donor.code)?.reasons.map((r) => r.code)).toContain('EX_RECENTLY_INVITED');
  });

  it('refuses to search or approve while outreach is paused', async () => {
    await newDonor({ km: 1 });
    const { requestId, agent } = await verifiedRequest();
    const waveId = (await matching.startSearch(requestId))!;
    await db.query('UPDATE req.blood_request SET outreach_paused = true, outreach_paused_reason = $2, outreach_paused_at = now() WHERE id = $1', [requestId, 'test']);
    await expect(matching.approveWave(agent, waveId, {})).rejects.toMatchObject({ response: { code: 'OUTREACH_PAUSED' } });
    await expect(matching.expandSearch(agent, requestId)).rejects.toMatchObject({ response: { code: 'OUTREACH_PAUSED' } });
  });

  it('starts searches for verified requests found by the worker', async () => {
    const { requestId } = await verifiedRequest();
    expect(await matching.startPendingSearches()).toBeGreaterThanOrEqual(1);
    const runs = await db.query('SELECT wave_no, trigger FROM src.match_run WHERE request_id = $1', [requestId]);
    expect(runs.rows).toEqual([{ wave_no: 1, trigger: 'AUTO_ON_VERIFIED' }]);
  });
});
