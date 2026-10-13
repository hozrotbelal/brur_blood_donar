import { randomUUID } from 'node:crypto';
import { AuditService } from '../../src/platform/audit/audit.service';
import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { PolicyService } from '../../src/platform/policy/policy.service';
import { Principal } from '../../src/platform/policy/policy.types';
import { StatusHistoryService } from '../../src/platform/status/status-history.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SmsSender } from '../../src/modules/identity/sms.port';
import { TokenService } from '../../src/modules/identity/token.service';
import { RequestService } from '../../src/modules/request/request.service';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class CapturingSms extends SmsSender {
  last = '';
  send(_phone: string, text: string) {
    this.last = /(\d{6})/.exec(text)![1];
    return Promise.resolve();
  }
}

suite('request flow (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let requests: RequestService;
  const sms = new CapturingSms();
  const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  async function newPatientUser(): Promise<Principal> {
    const p = phone();
    const { challengeId } = await auth.register({ phone: p, role: 'PAT', language: 'bn' });
    const { setupToken } = await auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'bn' });
    await auth.setPassword({
      setupToken,
      password: 'correct horse battery',
      device: { installId: randomUUID(), platform: 'android', model: 'T', osVersion: '14', appVersion: '1' },
    });
    const row = await db.query<{ id: string }>('SELECT id FROM idn.app_user WHERE phone_e164 = $1', [`+880${p.slice(1)}`]);
    const userId = row.rows[0].id;
    return { userId, role: 'PAT', grants: await auth.loadGrants(userId, 'PAT') };
  }

  const body = (patientId: string) => ({
    patientId,
    requestedBloodGroup: 'O+' as const,
    component: 'WHOLE_BLOOD' as const,
    quantityUnits: 2,
    requiredBy: new Date(Date.now() + 86_400_000).toISOString(),
    urgency: 'Urgent' as const,
    contactPhone: `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
  });

  beforeAll(() => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
    const tokens = new TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' } as AppConfig);
    const outbox = new OutboxService();
    const audit = new AuditService(outbox);
    auth = new AuthService(db, new PasswordService(), tokens, sms, outbox, audit);
    requests = new RequestService(db, new PolicyService(), new StatusHistoryService(audit), outbox);
  });
  afterAll(() => db.onModuleDestroy());

  it('gives a new patient user the starter permissions', async () => {
    const user = await newPatientUser();
    expect(user.grants.map((g) => g.key)).toEqual(expect.arrayContaining(['blood_request.create', 'blood_request.cancel']));
  });

  it('creates a draft, submits it with a reference number, records history, and cancels', async () => {
    const user = await newPatientUser();
    const patient = await requests.createPatient(user, { displayName: 'Test Patient', relationship: 'PARENT' });
    const draft = await requests.createRequest(user, body(patient.id));
    expect(draft.status).toBe('Draft');
    expect(draft.referenceNo).toBeNull();

    const submitted = await requests.submit(user, draft.id);
    expect(submitted.status).toBe('Submitted');
    expect(submitted.referenceNo).toMatch(/^REQ-\d{4}-\d{6}$/);
    expect(submitted.milestones.donorWillingAt).toBeNull();
    await expect(requests.submit(user, draft.id)).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });

    const cancelled = await requests.cancel(user, draft.id, { reason: 'NO_LONGER_REQUIRED' });
    expect(cancelled.status).toBe('Cancelled');

    const history = await db.query<{ to_status: string }>(
      "SELECT to_status FROM aud.status_history WHERE entity_id = $1 ORDER BY occurred_at, to_status",
      [draft.id],
    );
    expect(history.rows.map((r) => r.to_status).sort()).toEqual(['Cancelled', 'Draft', 'Submitted']);
  });

  it('returns the same draft for a repeated client mutation id', async () => {
    const user = await newPatientUser();
    const patient = await requests.createPatient(user, { displayName: 'P', relationship: 'SELF' });
    const clientMutationId = randomUUID();
    const a = await requests.createRequest(user, { ...body(patient.id), clientMutationId });
    const b = await requests.createRequest(user, { ...body(patient.id), clientMutationId });
    expect(b.id).toBe(a.id);
  });

  it('hides requests and patients from other users', async () => {
    const owner = await newPatientUser();
    const other = await newPatientUser();
    const patient = await requests.createPatient(owner, { displayName: 'P', relationship: 'SELF' });
    const draft = await requests.createRequest(owner, body(patient.id));
    await expect(requests.getRequest(other, draft.id)).rejects.toMatchObject({ response: { code: 'REQUEST_NOT_FOUND' } });
    await expect(requests.submit(other, draft.id)).rejects.toMatchObject({ response: { code: 'REQUEST_NOT_FOUND' } });
    await expect(requests.createRequest(other, body(patient.id))).rejects.toMatchObject({ response: { code: 'PATIENT_NOT_FOUND' } });
    expect(await requests.listRequests(other)).toEqual([]);
  });

  it('refuses a past required-by time and does not let a patient cancel while awaiting outcome', async () => {
    const user = await newPatientUser();
    const patient = await requests.createPatient(user, { displayName: 'P', relationship: 'SELF' });
    await expect(requests.createRequest(user, { ...body(patient.id), requiredBy: new Date(Date.now() - 1000).toISOString() })).rejects.toMatchObject({
      response: { code: 'REQUIRED_BY_IN_PAST' },
    });
    const draft = await requests.createRequest(user, body(patient.id));
    await db.query("UPDATE req.blood_request SET status = 'Awaiting outcome' WHERE id = $1", [draft.id]);
    await expect(requests.cancel(user, draft.id, { reason: 'OTHER' })).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
  });
});
