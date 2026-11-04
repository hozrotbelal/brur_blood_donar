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
import { TokenService } from '../../src/platform/security/token.service';
import { RequestService } from '../../src/modules/request/request.service';
import { buildAuth, setupTokenOf, testDevice } from './identity-harness';

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
    const setupToken = setupTokenOf(await auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'bn' }));
    await auth.setPassword({
      setupToken,
      password: 'correct horse battery',
      device: testDevice(),
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
    auth = buildAuth(db, tokens, sms, outbox, audit);
    requests = new RequestService(db, new PolicyService(), new StatusHistoryService(audit), outbox, audit);
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

  it('edits a draft directly, auto-applies non-material changes and holds material ones for Support', async () => {
    const user = await newPatientUser();
    const patient = await requests.createPatient(user, { displayName: 'P', relationship: 'SELF', hospitalPatientRef: 'PT-0001' });
    const draft = await requests.createRequest(user, body(patient.id));
    expect(draft.patientRef).toBe('PT-0001');

    const edited = await requests.updateRequest(user, draft.id, { requestedBloodGroup: 'A+', specialInstructions: 'Ward 4' });
    expect(edited.request.requestedBloodGroup).toBe('A+');
    expect(edited.changes.every((c) => c.status === 'Auto-applied')).toBe(true);

    await requests.submit(user, draft.id);
    const result = await requests.updateRequest(user, draft.id, { specialInstructions: 'Ward 5', quantityUnits: 4 });
    expect(result.request.specialInstructions).toBe('Ward 5');
    expect(result.request.quantityUnits).toBe(2);
    expect(result.changes.map((c) => [c.changeType, c.status])).toEqual([
      ['SPECIAL_INSTRUCTIONS', 'Auto-applied'],
      ['QUANTITY', 'Pending'],
    ]);
    await expect(requests.updateRequest(user, draft.id, { quantityUnits: 5 })).rejects.toMatchObject({ response: { code: 'CHANGE_PENDING' } });
    await expect(requests.updateRequest(user, draft.id, { specialInstructions: 'Ward 5' })).rejects.toMatchObject({ response: { code: 'NO_CHANGES' } });
    expect(await requests.listChanges(user, draft.id)).toHaveLength(4);

    const history = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM aud.status_history WHERE entity_type = 'REQUEST_CHANGE' AND context_request_id = $1",
      [draft.id],
    );
    expect(Number(history.rows[0].n)).toBe(4);
  });

  it('raises priority on an urgent problem and returns aggregate counts only', async () => {
    const user = await newPatientUser();
    const patient = await requests.createPatient(user, { displayName: 'P', relationship: 'SELF' });
    const draft = await requests.createRequest(user, body(patient.id));
    await expect(requests.reportUrgentProblem(user, draft.id, {})).rejects.toMatchObject({ response: { code: 'URGENT_PROBLEM_NOT_ALLOWED' } });
    await requests.submit(user, draft.id);
    expect((await requests.reportUrgentProblem(user, draft.id, {})).priority).toBe('High');
    expect((await requests.reportUrgentProblem(user, draft.id, {})).priority).toBe('Critical');
    expect(await requests.progress(user, draft.id)).toEqual({ contacted: 0, responded: 0, willing: 0, searchWave: 0 });

    const timeline = await requests.timeline(user, draft.id);
    expect(timeline.map((e) => e.actorRole)).toEqual(['PAT', 'PAT']);
  });

  it('refuses updates once the request is awaiting outcome', async () => {
    const user = await newPatientUser();
    const patient = await requests.createPatient(user, { displayName: 'P', relationship: 'SELF' });
    const draft = await requests.createRequest(user, body(patient.id));
    await db.query("UPDATE req.blood_request SET status = 'Awaiting outcome' WHERE id = $1", [draft.id]);
    await expect(requests.updateRequest(user, draft.id, { specialInstructions: 'x' })).rejects.toMatchObject({ response: { code: 'UPDATE_NOT_ALLOWED' } });
  });
});
