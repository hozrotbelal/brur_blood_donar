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
import { AppointmentService } from '../../src/modules/case-workflow/appointment.service';
import { OutcomeService } from '../../src/modules/case-workflow/outcome.service';
import { OutreachService } from '../../src/modules/request/outreach.service';
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

suite('coordination cases, appointments and outcomes (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let donors: DonorService;
  let requests: RequestService;
  let review: ReviewService;
  let matching: MatchingService;
  let invitations: InvitationService;
  let cases: CaseService;
  let appointments: AppointmentService;
  let outcomes: OutcomeService;
  let outreach: OutreachService;
  let policy: PolicyService;
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
    policy = new PolicyService();
    const support = new CaseSupport(policy, history, outbox);
    auth = new AuthService(db, new PasswordService(), tokens, sms, outbox, audit);
    donors = new DonorService(db, history, outbox);
    requests = new RequestService(db, policy, history, outbox);
    review = new ReviewService(db, policy, history, outbox);
    matching = new MatchingService(db, policy, history, outbox);
    cases = new CaseService(db, support, history);
    invitations = new InvitationService(db, history, outbox, cases);
    appointments = new AppointmentService(db, support, cases, history);
    outcomes = new OutcomeService(db, support, cases, history);
    outreach = new OutreachService(db, policy, outbox);
  });
  afterAll(() => db.onModuleDestroy());

  async function facility(areaId: string) {
    const f = await db.query<{ id: string }>(
      `INSERT INTO apt.facility (facility_type, name_en, area_id, contact_phone, status, is_verified)
       VALUES ('COLLECTION_SERVICE', 'Test Service', $1, '+8801700000000', 'Active', true) RETURNING id`,
      [areaId],
    );
    return f.rows[0].id;
  }

  async function answered(units: { urgency?: 'Routine' | 'Urgent' | 'Critical'; extraDonor?: boolean } = {}) {
    const donor = await newDonor({ km: 1 });
    if (units.extraDonor) await newDonor({ km: 3 });
    const ctx = await verifiedRequest(units.urgency);
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    const inv = (await invitations.list(donor.user))[0];
    await invitations.respond(donor.user, inv.id, { response: 'Available' });
    const detail = await cases.list(ctx.agent);
    const c = detail.find((x: { requestId: string }) => x.requestId === ctx.requestId)!;
    const full = await cases.detail(ctx.agent, c.id);
    const facilityId = await facility(ctx.areaId);
    return { ...ctx, donor, invitationId: inv.id, caseId: c.id as string, caseDonorId: (full.donors[0] as { id: string }).id, facilityId, waveId };
  }

  const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const caseStatus = async (id: string) => (await db.query('SELECT status FROM crd.coordination_case WHERE id = $1', [id])).rows[0].status;
  const requestStatus = async (id: string) => (await db.query('SELECT status FROM req.blood_request WHERE id = $1', [id])).rows[0].status;

  it('opens one case with its checklist when the first donor answers Available, and attaches later donors to it', async () => {
    const ctx = await answered({ extraDonor: true });
    expect(await caseStatus(ctx.caseId)).toBe('Open');
    const cs = await db.query('SELECT case_no, owner_user_id FROM crd.coordination_case WHERE id = $1', [ctx.caseId]);
    expect(cs.rows[0].case_no).toMatch(/^CASE-\d{4}-\d{6}$/);
    expect(cs.rows[0].owner_user_id).toBe(ctx.agent.userId);
    const tasks = await db.query(`SELECT task_type FROM crd.case_task WHERE case_id = $1 ORDER BY task_type`, [ctx.caseId]);
    expect(tasks.rows).toHaveLength(4);

    const second = await db.query<{ id: string }>(`SELECT id FROM src.invitation WHERE request_id = $1 AND donor_profile_id <> $2 AND status IN ('Sent','Viewed')`, [ctx.requestId, ctx.donor.profileId]);
    expect(second.rows).toHaveLength(1);
    await db.query(`UPDATE src.invitation SET status = 'Sent' WHERE id = $1`, [second.rows[0].id]);
    const secondDonor = await db.query<{ user_id: string }>(`SELECT d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id WHERE i.id = $1`, [second.rows[0].id]);
    const principal: Principal = { userId: secondDonor.rows[0].user_id, role: 'DON', grants: await auth.loadGrants(secondDonor.rows[0].user_id, 'DON') };
    await invitations.respond(principal, second.rows[0].id, { response: 'Available' });
    const members = await db.query('SELECT count(*)::int AS n FROM crd.case_donor WHERE case_id = $1', [ctx.caseId]);
    expect(members.rows[0].n).toBe(2);
    const count = await db.query('SELECT count(*)::int AS n FROM crd.coordination_case WHERE request_id = $1', [ctx.requestId]);
    expect(count.rows[0].n).toBe(1);
  });

  it('runs propose, confirm and a timing problem through the case states', async () => {
    const ctx = await answered();
    await cases.startScheduling(ctx.agent, ctx.caseId);
    expect(await caseStatus(ctx.caseId)).toBe('Scheduling');
    const appt = await appointments.propose(ctx.agent, ctx.caseId, { caseDonorId: ctx.caseDonorId, facilityId: ctx.facilityId, scheduledStart: inHours(5) });
    expect(appt.status).toBe('Proposed');

    const mine = await appointments.listForDonor(ctx.donor.user);
    expect(mine.map((a: { id: string }) => a.id)).toContain(appt.id);
    const confirmed = await appointments.confirm(ctx.donor.user, appt.id);
    expect(confirmed.status).toBe('Confirmed');
    expect(await caseStatus(ctx.caseId)).toBe('Scheduled');

    const stranger = await newDonor();
    await expect(appointments.confirm(stranger.user, appt.id)).rejects.toMatchObject({ status: 404 });

    await appointments.reportTimingProblem(ctx.donor.user, appt.id, { note: 'running late' });
    const task = await db.query(`SELECT 1 FROM crd.case_task WHERE case_id = $1 AND task_type = 'TK_RESOLVE_TRAVEL_TIMING'`, [ctx.caseId]);
    expect(task.rows).toHaveLength(1);

    const moved = await appointments.reschedule(ctx.agent, appt.id, { scheduledStart: inHours(8) });
    expect(moved.status).toBe('Proposed');
    const old = await db.query('SELECT status FROM crd.appointment WHERE id = $1', [appt.id]);
    expect(old.rows[0].status).toBe('Rescheduled');
  });

  it('refuses a case or appointment from an agent outside the request area', async () => {
    const ctx = await answered();
    const other = await verifiedRequest();
    await expect(cases.detail(other.agent, ctx.caseId)).rejects.toMatchObject({ status: 404 });
    await expect(cases.startScheduling(other.agent, ctx.caseId)).rejects.toMatchObject({ status: 404 });
  });

  it('marks a no-show only after the grace period and sends the request back to Searching with a replacement wave', async () => {
    const ctx = await answered();
    await cases.startScheduling(ctx.agent, ctx.caseId);
    const appt = await appointments.propose(ctx.agent, ctx.caseId, { caseDonorId: ctx.caseDonorId, facilityId: ctx.facilityId, scheduledStart: inHours(2) });
    await appointments.confirm(ctx.donor.user, appt.id);
    await expect(appointments.recordNoShow(ctx.agent, appt.id)).rejects.toMatchObject({ response: { code: 'GRACE_PERIOD_NOT_OVER' } });

    await db.query(`UPDATE crd.appointment SET scheduled_start = now() - interval '3 hours' WHERE id = $1`, [appt.id]);
    const done = await appointments.recordNoShow(ctx.agent, appt.id);
    expect(done.status).toBe('No-show');
    expect(await caseStatus(ctx.caseId)).toBe('Needs replacement');
    expect(await requestStatus(ctx.requestId)).toBe('Searching');

    await db.query(`UPDATE src.match_run SET status = 'Completed' WHERE request_id = $1`, [ctx.requestId]);
    expect(await matching.proposeReplacementWaves()).toBeGreaterThanOrEqual(1);
    const waves = await matching.listWaves(ctx.agent, ctx.requestId);
    expect(waves.at(-1)!.trigger).toBe('REPLACEMENT');
    expect(await matching.proposeReplacementWaves()).toBe(0);
  });

  it('lets a donor withdraw from an invitation they accepted, which reopens the search', async () => {
    const ctx = await answered();
    await invitations.withdraw(ctx.donor.user, ctx.invitationId, { reason: 'SCHEDULE_CONFLICT' });
    expect(await caseStatus(ctx.caseId)).toBe('Needs replacement');
    expect(await requestStatus(ctx.requestId)).toBe('Searching');
    const tasks = await db.query(`SELECT 1 FROM crd.case_task WHERE case_id = $1 AND task_type = 'TK_HANDLE_WITHDRAWAL_NOSHOW'`, [ctx.caseId]);
    expect(tasks.rows).toHaveLength(1);
  });

  it('keeps a donor self-report from fulfilling the request, and fulfils only on service-confirmed units', async () => {
    const ctx = await answered();
    await cases.startScheduling(ctx.agent, ctx.caseId);
    const appt = await appointments.propose(ctx.agent, ctx.caseId, { caseDonorId: ctx.caseDonorId, facilityId: ctx.facilityId, scheduledStart: inHours(2) });
    await appointments.confirm(ctx.donor.user, appt.id);
    await expect(appointments.reportDonation(ctx.donor.user, appt.id)).rejects.toMatchObject({ response: { code: 'APPOINTMENT_NOT_STARTED' } });
    await db.query(`UPDATE crd.appointment SET scheduled_start = now() - interval '3 hours' WHERE id = $1`, [appt.id]);

    const reported = await appointments.reportDonation(ctx.donor.user, appt.id);
    expect(reported.status).toBe('Attended (reported)');
    expect(await caseStatus(ctx.caseId)).toBe('Outcome pending');
    expect(await requestStatus(ctx.requestId)).toBe('Awaiting outcome');
    await expect(outcomes.setFulfilment(ctx.agent, ctx.caseId)).rejects.toMatchObject({ response: { code: expect.any(String) } });
    expect(await requestStatus(ctx.requestId)).toBe('Awaiting outcome');

    await expect(
      outcomes.record(ctx.agent, ctx.caseId, { sourceType: 'COLLECTION_SERVICE_CONFIRMATION', outcomeType: 'UNITS_RECEIVED_BY_PATIENT_SERVICE', channel: 'PHONE', units: 1 }),
    ).rejects.toMatchObject({ response: { code: 'REPORTER_NAME_REQUIRED' } });
    const rec = await outcomes.record(ctx.agent, ctx.caseId, {
      sourceType: 'COLLECTION_SERVICE_CONFIRMATION', outcomeType: 'UNITS_RECEIVED_BY_PATIENT_SERVICE', channel: 'PHONE', units: 1, reportedByName: 'A. Rahman', reportedByRole: 'Technician',
    });
    expect(rec.confidence).toBe('Service-confirmed');
    await outcomes.setFulfilment(ctx.agent, ctx.caseId);
    expect(await requestStatus(ctx.requestId)).toBe('Fulfilled');
    expect(await caseStatus(ctx.caseId)).toBe('Resolved');

    await cases.close(ctx.agent, ctx.caseId, 'Follow-up done');
    expect(await caseStatus(ctx.caseId)).toBe('Closed');
  });

  it('marks a partial result and asks whether more donors are needed', async () => {
    const ctx = await answered();
    await db.query(`UPDATE req.blood_request SET quantity_units = 2 WHERE id = $1`, [ctx.requestId]);
    await cases.startScheduling(ctx.agent, ctx.caseId);
    const appt = await appointments.propose(ctx.agent, ctx.caseId, { caseDonorId: ctx.caseDonorId, facilityId: ctx.facilityId, scheduledStart: inHours(2) });
    await appointments.confirm(ctx.donor.user, appt.id);
    await db.query(`UPDATE crd.appointment SET scheduled_start = now() - interval '3 hours' WHERE id = $1`, [appt.id]);
    await appointments.reportDonation(ctx.donor.user, appt.id);
    await outcomes.record(ctx.agent, ctx.caseId, {
      sourceType: 'HOSPITAL_CONFIRMATION', outcomeType: 'UNITS_RECEIVED_BY_PATIENT_SERVICE', channel: 'IN_APP', units: 1,
    });
    await outcomes.setFulfilment(ctx.agent, ctx.caseId);
    expect(await requestStatus(ctx.requestId)).toBe('Partially fulfilled');
    const task = await db.query(`SELECT 1 FROM crd.case_task WHERE case_id = $1 AND task_type = 'TK_CONFIRM_MORE_DONORS_NEEDED'`, [ctx.caseId]);
    expect(task.rows).toHaveLength(1);
    await outcomes.moreDonors(ctx.agent, ctx.caseId, true);
    expect(await requestStatus(ctx.requestId)).toBe('Searching');
  });

  it('declares a request unable to fulfil, cancels its open invitations and closes the case through reconcile', async () => {
    const ctx = await answered();
    await outcomes.declareUnable(ctx.agent, ctx.requestId, 'No donors could reach the hospital in time');
    expect(await requestStatus(ctx.requestId)).toBe('Unable to fulfil');
    await cases.reconcileClosedRequests();
    expect(['Resolved', 'Closed']).toContain(await caseStatus(ctx.caseId));
    await invitations.cancelForEndedRequests();
    const open = await db.query(`SELECT count(*)::int AS n FROM src.invitation WHERE request_id = $1 AND status IN ('Queued','Sent','Viewed')`, [ctx.requestId]);
    expect(open.rows[0].n).toBe(0);
  });
  it('lets staff dispute a service-confirmed outcome, blocks fulfilment, and resolves it by correction', async () => {
    const ctx = await answered();
    await db.query(`UPDATE req.blood_request SET quantity_units = 2 WHERE id = $1`, [ctx.requestId]);
    await cases.startScheduling(ctx.agent, ctx.caseId);
    const appt = await appointments.propose(ctx.agent, ctx.caseId, { caseDonorId: ctx.caseDonorId, facilityId: ctx.facilityId, scheduledStart: inHours(2) });
    await appointments.confirm(ctx.donor.user, appt.id);
    await db.query(`UPDATE crd.appointment SET scheduled_start = now() - interval '3 hours' WHERE id = $1`, [appt.id]);
    await appointments.reportDonation(ctx.donor.user, appt.id);
    const rec = await outcomes.record(ctx.agent, ctx.caseId, {
      sourceType: 'HOSPITAL_CONFIRMATION', outcomeType: 'UNITS_RECEIVED_BY_PATIENT_SERVICE', channel: 'IN_APP', units: 2,
    });

    await outcomes.dispute(ctx.agent, ctx.caseId, rec.id, { reason: 'Hospital says only one unit arrived' });
    await expect(outcomes.dispute(ctx.agent, ctx.caseId, rec.id, { reason: 'Again please' })).rejects.toMatchObject({ response: { code: 'ALREADY_DISPUTED' } });
    expect((await db.query('SELECT disputed FROM crd.coordination_case WHERE id = $1', [ctx.caseId])).rows[0].disputed).toBe(true);
    const esc = await db.query(`SELECT status::text AS status FROM crd.escalation WHERE dedupe_key = $1`, [`dispute:${rec.id}`]);
    expect(esc.rows[0].status).toBe('Open');
    await expect(outcomes.setFulfilment(ctx.agent, ctx.caseId)).rejects.toMatchObject({ response: { code: 'CASE_DISPUTED' } });

    await expect(outcomes.resolveDispute(ctx.agent, ctx.caseId, rec.id, { resolution: 'CORRECTED', note: 'Corrected' })).rejects.toMatchObject({
      response: { code: 'CORRECTION_REQUIRED' },
    });
    const res = await outcomes.resolveDispute(ctx.agent, ctx.caseId, rec.id, {
      resolution: 'CORRECTED', note: 'Confirmed one unit by phone',
      correction: { sourceType: 'HOSPITAL_CONFIRMATION', outcomeType: 'UNITS_RECEIVED_BY_PATIENT_SERVICE', channel: 'IN_APP', units: 1 },
    });
    expect(res.disputed).toBe(false);
    expect((await db.query(`SELECT status::text AS status FROM crd.escalation WHERE dedupe_key = $1`, [`dispute:${rec.id}`])).rows[0].status).toBe('Resolved');
    await outcomes.setFulfilment(ctx.agent, ctx.caseId);
    expect(await requestStatus(ctx.requestId)).toBe('Partially fulfilled');
    expect((await db.query('SELECT fulfilled_quantity_units AS n FROM req.blood_request WHERE id = $1', [ctx.requestId])).rows[0].n).toBe(1);
  });

  it('upholds a disputed outcome and hides cases from agents outside their area', async () => {
    const ctx = await answered();
    await cases.startScheduling(ctx.agent, ctx.caseId);
    const appt = await appointments.propose(ctx.agent, ctx.caseId, { caseDonorId: ctx.caseDonorId, facilityId: ctx.facilityId, scheduledStart: inHours(2) });
    await appointments.confirm(ctx.donor.user, appt.id);
    await db.query(`UPDATE crd.appointment SET scheduled_start = now() - interval '3 hours' WHERE id = $1`, [appt.id]);
    await appointments.reportDonation(ctx.donor.user, appt.id);
    const rec = await outcomes.record(ctx.agent, ctx.caseId, { sourceType: 'HOSPITAL_CONFIRMATION', outcomeType: 'UNITS_RECEIVED_BY_PATIENT_SERVICE', channel: 'IN_APP', units: 1 });
    const stranger = await newAgent((await verifiedRequest()).areaId);
    await expect(outcomes.dispute(stranger, ctx.caseId, rec.id, { reason: 'Not my case at all' })).rejects.toMatchObject({ status: 404 });
    await outcomes.dispute(ctx.agent, ctx.caseId, rec.id, { reason: 'Looks wrong, checking' });
    await outcomes.resolveDispute(ctx.agent, ctx.caseId, rec.id, { resolution: 'UPHELD', note: 'Checked, outcome stands' });
    await outcomes.setFulfilment(ctx.agent, ctx.caseId);
    expect(await requestStatus(ctx.requestId)).toBe('Fulfilled');
  });

  it('pauses and resumes outreach for a request, holding queued invitations while paused', async () => {
    const donor = await newDonor({ km: 1 });
    const ctx = await verifiedRequest();
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await expect(outreach.pause(ctx.agent, ctx.requestId, 'x')).resolves.toMatchObject({ outreachPaused: true });
    expect((await db.query('SELECT outreach_paused_reason AS r FROM req.blood_request WHERE id = $1', [ctx.requestId])).rows[0].r).toBe('x');
    await invitations.dispatchDue(1000);
    expect(await invitations.list(donor.user)).toHaveLength(0);

    const stranger = await newAgent((await verifiedRequest()).areaId);
    await expect(outreach.resume(stranger, ctx.requestId)).rejects.toMatchObject({ status: 404 });
    await expect(outreach.resume(ctx.agent, ctx.requestId)).resolves.toMatchObject({ outreachPaused: false });
    await invitations.dispatchDue(1000);
    expect(await invitations.list(donor.user)).toHaveLength(1);
  });
});
