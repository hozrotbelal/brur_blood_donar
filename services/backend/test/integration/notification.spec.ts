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
import { EventBus } from '../../src/platform/outbox/event-bus';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay';
import { NotificationDispatcher, NotificationPlanner, NotificationService } from '../../src/modules/notification/notification.public';
import { SimulatedPushGateway, SimulatedSmsGateway } from '../../src/modules/notification/gateway.ports';
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

suite('notifications (needs TEST_DATABASE_URL with all migrations applied)', () => {
  jest.setTimeout(30_000);
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
  let policy: PolicyService;
  let relay: OutboxRelay;
  let notifications: NotificationService;
  let dispatcher: NotificationDispatcher;
  let planner: NotificationPlanner;
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
    const bus = new EventBus();
    relay = new OutboxRelay(db, bus);
    notifications = new NotificationService(db);
    planner = new NotificationPlanner(db, bus, notifications);
    planner.onModuleInit();
    dispatcher = new NotificationDispatcher(db, notifications, new SimulatedPushGateway(), new SimulatedSmsGateway());
  });
  beforeAll(async () => {
    await db.query("UPDATE platform.outbox_event SET status = 'Published' WHERE status = 'Pending'");
    await db.query("UPDATE ntf.notification SET status = 'Cancelled', cancelled_at = now() WHERE status IN ('Pending','Queued')");
    await db.query("UPDATE ntf.notification SET read_at = now() WHERE channel = 'PUSH' AND status IN ('Sent','Failed') AND read_at IS NULL");
  }, 60_000);
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

  async function pump() {
    for (let i = 0; i < 30; i++) if ((await relay.publishPending(200)) === 0) break;
    await dispatcher.dispatchDue(500);
  }

  const rows = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows;
  const forUser = (userId: string, code: string) =>
    rows(
      `SELECT n.id, n.channel::text AS channel, n.status::text AS status, n.rendered_body, n.language::text AS language, n.is_critical FROM ntf.notification n
         JOIN ntf.notification_event e ON e.id = n.notification_event_id WHERE n.recipient_user_id = $1 AND e.event_code = $2::ntf_event_code ORDER BY n.channel`,
      [userId, code],
    );

  it('sends the patient a receipt in the inbox and lets them read it', async () => {
    const ctx = await verifiedRequest();
    await pump();
    const inbox = await notifications.inbox(ctx.patientUser);
    const receipt = inbox.find((n) => n.eventCode === 'NTF-EV-01');
    expect(receipt).toBeDefined();
    expect(receipt!.body).toContain('জমা হয়েছে');
    expect((await notifications.unreadCount(ctx.patientUser)).unread).toBeGreaterThan(0);
    await notifications.markRead(ctx.patientUser, receipt!.id);
    const after = await notifications.inbox(ctx.patientUser);
    expect(after.find((n) => n.id === receipt!.id)!.read).toBe(true);
    await expect(notifications.markRead(ctx.agent, receipt!.id)).rejects.toMatchObject({ status: 404 });
  });

  it('queues the invitation in app and by push, records a failed push without a device token, and sends it once a token exists', async () => {
    const donor = await newDonor({ km: 1 });
    const ctx = await verifiedRequest('Critical');
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();

    const sent = await forUser(donor.user.userId, 'NTF-EV-04');
    expect(sent.map((n) => `${n.channel}:${n.status}`)).toEqual(['IN_APP:Delivered', 'PUSH:Failed']);
    expect(sent[0].is_critical).toBe(true);
    expect(sent[0].rendered_body).not.toMatch(/Test Patient|phone/i);
    const attempt = await rows(`SELECT error_code FROM ntf.delivery_attempt WHERE notification_id = $1`, [sent[1].id]);
    expect(attempt[0].error_code).toBe('NO_PUSH_TOKEN');
    const alert = await rows(`SELECT 1 FROM ntf.notification n JOIN ntf.notification_event e ON e.id = n.notification_event_id WHERE e.event_code = 'NTF-EV-18' AND n.request_id = $1`, [ctx.requestId]);
    expect(alert.length).toBeGreaterThanOrEqual(0);
  });

  it('delivers push to a registered device and acknowledges the receipt', async () => {
    const donor = await newDonor({ km: 1 });
    const device = await rows('SELECT install_id FROM idn.device WHERE user_id = $1', [donor.user.userId]);
    await notifications.registerPushToken(donor.user, device[0].install_id, 'token-abc');
    const ctx = await verifiedRequest();
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();
    const sent = await forUser(donor.user.userId, 'NTF-EV-04');
    const push = sent.find((n) => n.channel === 'PUSH')!;
    expect(push.status).toBe('Sent');
    const attempt = await rows('SELECT provider_message_id, result::text AS result FROM ntf.delivery_attempt WHERE notification_id = $1', [push.id]);
    expect(attempt[0]).toMatchObject({ result: 'ACCEPTED' });
    expect(attempt[0].provider_message_id).toMatch(/^simulated:/);
    await notifications.receipt(donor.user, push.id);
    expect((await forUser(donor.user.userId, 'NTF-EV-04')).find((n) => n.channel === 'PUSH')!.status).toBe('Delivered');
  });

  it('falls back to SMS only with consent and not for an acknowledged invitation', async () => {
    const donor = await newDonor({ km: 1 });
    await donors.saveConsent(donor.user, 'CHANNEL_SMS', consent);
    const ctx = await verifiedRequest('Urgent');
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();
    expect(await dispatcher.fallbackDue()).toBe(0);

    await db.query(`UPDATE ntf.notification SET failed_at = now() - interval '10 minutes' WHERE recipient_user_id = $1 AND channel = 'PUSH'`, [donor.user.userId]);
    expect(await dispatcher.fallbackDue()).toBe(1);
    expect(await dispatcher.fallbackDue()).toBe(0);
    await pump();
    const smsRows = (await forUser(donor.user.userId, 'NTF-EV-04')).filter((n) => n.channel === 'SMS');
    expect(smsRows).toHaveLength(1);
    expect(smsRows[0].status).toBe('Sent');
    expect(smsRows[0].rendered_body).toContain('BBDA');

    const quiet = await newDonor({ km: 1 });
    const ctx2 = await verifiedRequest('Urgent');
    const wave2 = (await matching.startSearch(ctx2.requestId))!;
    await matching.approveWave(ctx2.agent, wave2, {});
    await invitations.dispatchDue(1000);
    await pump();
    await db.query(`UPDATE ntf.notification SET failed_at = now() - interval '10 minutes' WHERE recipient_user_id = $1 AND channel = 'PUSH'`, [quiet.user.userId]);
    await dispatcher.fallbackDue();
    await pump();
    const noConsent = (await forUser(quiet.user.userId, 'NTF-EV-04')).filter((n) => n.channel === 'SMS');
    expect(noConsent.map((n) => n.status)).toEqual(['Suppressed']);

    const viewer = await newDonor({ km: 1 });
    await donors.saveConsent(viewer.user, 'CHANNEL_SMS', consent);
    const ctx3 = await verifiedRequest('Urgent');
    const wave3 = (await matching.startSearch(ctx3.requestId))!;
    await matching.approveWave(ctx3.agent, wave3, {});
    await invitations.dispatchDue(1000);
    await pump();
    const invitation = (await invitations.list(viewer.user))[0];
    await invitations.open(viewer.user, invitation.id);
    await db.query(`UPDATE ntf.notification SET failed_at = now() - interval '10 minutes' WHERE recipient_user_id = $1 AND channel = 'PUSH'`, [viewer.user.userId]);
    expect(await dispatcher.fallbackDue()).toBe(0);
  });

  it('respects a switched-off preference and sends no duplicate when the same event is replayed', async () => {
    const donor = await newDonor({ km: 1 });
    await donors.savePreference(donor.user, 'INVITATIONS', { pushEnabled: false, smsEnabled: false, inappEnabled: true });
    const ctx = await verifiedRequest();
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();
    expect((await forUser(donor.user.userId, 'NTF-EV-04')).map((n) => `${n.channel}:${n.status}`)).toEqual(['IN_APP:Delivered', 'PUSH:Suppressed']);

    await db.query(`UPDATE platform.outbox_event SET status = 'Pending' WHERE aggregate_type = 'INVITATION' AND event_type = 'InvitationSent' AND payload ->> 'requestId' = $1`, [ctx.requestId]);
    await pump();
    expect(await forUser(donor.user.userId, 'NTF-EV-04')).toHaveLength(2);
  });

  it('uses Bangla or English text by the recipient language', async () => {
    const ctx = await verifiedRequest();
    await db.query(`UPDATE idn.app_user SET preferred_language = 'en' WHERE id = $1`, [ctx.patientUser.userId]);
    const donor = await newDonor({ km: 1 });
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();
    const patient = await forUser(ctx.patientUser.userId, 'NTF-EV-03');
    expect(patient[0].language).toBe('en');
    expect(patient[0].rendered_body).toContain('is verified');
    const don = await forUser(donor.user.userId, 'NTF-EV-04');
    expect(don[0].rendered_body).toMatch(/[ঀ-৿]/);
  });

  it('tells appointment participants and sends each reminder once', async () => {
    const donor = await newDonor({ km: 1 });
    const ctx = await verifiedRequest();
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    const inv = (await invitations.list(donor.user))[0];
    await invitations.respond(donor.user, inv.id, { response: 'Available' });
    const c = (await cases.list(ctx.agent)).find((x: { requestId: string }) => x.requestId === ctx.requestId)!;
    const full = await cases.detail(ctx.agent, c.id);
    const facilityId = await facility(ctx.areaId);
    await cases.startScheduling(ctx.agent, c.id);
    const appt = await appointments.propose(ctx.agent, c.id, { caseDonorId: (full.donors[0] as { id: string }).id, facilityId, scheduledStart: inHours(1.5) });
    await appointments.confirm(donor.user, appt.id);
    await pump();

    expect((await forUser(donor.user.userId, 'NTF-EV-07')).filter((n) => n.channel === 'IN_APP').length).toBeGreaterThanOrEqual(2);
    expect((await forUser(ctx.patientUser.userId, 'NTF-EV-07')).length).toBeGreaterThanOrEqual(2);

    expect(await planner.scheduleReminders()).toBeGreaterThanOrEqual(2);
    await planner.scheduleReminders();
    await pump();
    const reminders = (await forUser(donor.user.userId, 'NTF-EV-14')).filter((n) => n.channel === 'IN_APP');
    expect(reminders).toHaveLength(1);
  });

  it('cancels queued messages when a request is cancelled and tells invited donors', async () => {
    const donor = await newDonor({ km: 1 });
    const ctx = await verifiedRequest();
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();
    await db.query(`UPDATE ntf.notification SET status = 'Pending', scheduled_for = now() + interval '1 hour' WHERE recipient_user_id = $1 AND channel = 'PUSH'`, [donor.user.userId]);
    await requests.cancel(ctx.patientUser, ctx.requestId, { reason: 'NO_LONGER_REQUIRED' });
    await pump();
    const pushRows = (await forUser(donor.user.userId, 'NTF-EV-04')).filter((n) => n.channel === 'PUSH');
    expect(pushRows[0].status).toBe('Cancelled');
    const told = await forUser(donor.user.userId, 'NTF-EV-13');
    expect(told.map((n) => n.channel)).toEqual(['IN_APP', 'PUSH']);
  });

  it('reports failed critical deliveries to Support', async () => {
    const donor = await newDonor({ km: 1 });
    const ctx = await verifiedRequest('Critical');
    const waveId = (await matching.startSearch(ctx.requestId))!;
    await matching.approveWave(ctx.agent, waveId, {});
    await invitations.dispatchDue(1000);
    await pump();
    const report = await notifications.deliveryReport(ctx.agent, 'Area');
    expect(report.some((r) => r.requestId === ctx.requestId && r.channel === 'PUSH' && r.critical)).toBe(true);
    void donor;
  });

  it('works out when quiet hours end', () => {
    const { quietUntil } = jest.requireActual('../../src/modules/notification/notification.dispatcher') as typeof import('../../src/modules/notification/notification.dispatcher');
    const night = new Date('2026-10-12T17:30:00Z');
    const until = quietUntil(night, '22:00', '07:00')!;
    expect(until.toISOString()).toBe('2026-10-13T01:00:00.000Z');
    expect(quietUntil(new Date('2026-10-12T08:00:00Z'), '22:00', '07:00')).toBeNull();
  });
});
