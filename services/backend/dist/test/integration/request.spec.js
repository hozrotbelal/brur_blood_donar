"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../src/platform/audit/audit.service");
const database_service_1 = require("../../src/platform/db/database.service");
const outbox_service_1 = require("../../src/platform/outbox/outbox.service");
const policy_service_1 = require("../../src/platform/policy/policy.service");
const status_history_service_1 = require("../../src/platform/status/status-history.service");
const auth_service_1 = require("../../src/modules/identity/auth.service");
const password_service_1 = require("../../src/modules/identity/password.service");
const sms_port_1 = require("../../src/modules/identity/sms.port");
const token_service_1 = require("../../src/modules/identity/token.service");
const request_service_1 = require("../../src/modules/request/request.service");
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
class CapturingSms extends sms_port_1.SmsSender {
    last = '';
    send(_phone, text) {
        this.last = /(\d{6})/.exec(text)[1];
        return Promise.resolve();
    }
}
suite('request flow (needs TEST_DATABASE_URL with all migrations applied)', () => {
    let db;
    let auth;
    let requests;
    const sms = new CapturingSms();
    const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    async function newPatientUser() {
        const p = phone();
        const { challengeId } = await auth.register({ phone: p, role: 'PAT', language: 'bn' });
        const { setupToken } = await auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'bn' });
        await auth.setPassword({
            setupToken,
            password: 'correct horse battery',
            device: { installId: (0, node_crypto_1.randomUUID)(), platform: 'android', model: 'T', osVersion: '14', appVersion: '1' },
        });
        const row = await db.query('SELECT id FROM idn.app_user WHERE phone_e164 = $1', [`+880${p.slice(1)}`]);
        const userId = row.rows[0].id;
        return { userId, role: 'PAT', grants: await auth.loadGrants(userId, 'PAT') };
    }
    const body = (patientId) => ({
        patientId,
        requestedBloodGroup: 'O+',
        component: 'WHOLE_BLOOD',
        quantityUnits: 2,
        requiredBy: new Date(Date.now() + 86_400_000).toISOString(),
        urgency: 'Urgent',
        contactPhone: `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    });
    beforeAll(() => {
        db = new database_service_1.DatabaseService({ databaseUrl: url });
        const tokens = new token_service_1.TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' });
        const outbox = new outbox_service_1.OutboxService();
        const audit = new audit_service_1.AuditService(outbox);
        auth = new auth_service_1.AuthService(db, new password_service_1.PasswordService(), tokens, sms, outbox, audit);
        requests = new request_service_1.RequestService(db, new policy_service_1.PolicyService(), new status_history_service_1.StatusHistoryService(audit), outbox);
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
        const history = await db.query("SELECT to_status FROM aud.status_history WHERE entity_id = $1 ORDER BY occurred_at, to_status", [draft.id]);
        expect(history.rows.map((r) => r.to_status).sort()).toEqual(['Cancelled', 'Draft', 'Submitted']);
    });
    it('returns the same draft for a repeated client mutation id', async () => {
        const user = await newPatientUser();
        const patient = await requests.createPatient(user, { displayName: 'P', relationship: 'SELF' });
        const clientMutationId = (0, node_crypto_1.randomUUID)();
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
//# sourceMappingURL=request.spec.js.map