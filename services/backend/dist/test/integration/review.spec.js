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
const review_service_1 = require("../../src/modules/request/review.service");
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const fullChecklist = {
    documentLegible: true, bloodGroupAndComponentMatch: true, facilityExists: true,
    representativeReachable: true, noDuplicate: true, urgencyConsistent: true,
};
describe('review helpers', () => {
    it('lists the checklist items that are not ticked', () => {
        expect((0, review_service_1.checklistGaps)(fullChecklist)).toEqual([]);
        expect((0, review_service_1.checklistGaps)({ ...fullChecklist, noDuplicate: false, facilityExists: false })).toEqual(['FACILITY_EXISTS', 'NO_DUPLICATE']);
    });
    it('finds the widest live scope', () => {
        const p = {
            userId: 'u', role: 'SUP',
            grants: [
                { key: 'k', scope: 'Assigned' },
                { key: 'k', scope: 'Area' },
                { key: 'k', scope: 'All', expiresAt: new Date(Date.now() - 1000) },
            ],
        };
        expect((0, review_service_1.widestScope)(p, 'k')).toBe('Area');
        expect((0, review_service_1.widestScope)(p, 'other')).toBeNull();
    });
});
class CapturingSms extends sms_port_1.SmsSender {
    last = '';
    send(_phone, text) {
        this.last = /(\d{6})/.exec(text)[1];
        return Promise.resolve();
    }
}
suite('staff request review (needs TEST_DATABASE_URL with all migrations applied)', () => {
    let db;
    let auth;
    let requests;
    let review;
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
        return { userId: row.rows[0].id, role: 'PAT', grants: await auth.loadGrants(row.rows[0].id, 'PAT') };
    }
    async function newArea() {
        const r = await db.query(`INSERT INTO cfg.area (level, code, name_en, name_bn, is_active) VALUES ('DISTRICT', $1, 'Test', 'পরীক্ষা', true) RETURNING id`, [`T-${(0, node_crypto_1.randomUUID)()}`]);
        return r.rows[0].id;
    }
    async function newStaff(role, setCode, areaId) {
        const user = await db.query(`INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), true) RETURNING id`, [`+880${phone().slice(1)}`]);
        const userId = user.rows[0].id;
        const ur = await db.query(`INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = $2 RETURNING id`, [userId, role]);
        if (areaId) {
            await db.query(`INSERT INTO idn.permission_scope (user_role_id, scope_code, area_id, granted_by) VALUES ($1, 'scope.area', $2, $3)`, [ur.rows[0].id, areaId, userId]);
        }
        await db.query(`INSERT INTO idn.user_permission_set (user_id, permission_set_id, status, effective_from)
       SELECT $1, id, 'Active', now() FROM idn.permission_set WHERE code = $2`, [userId, setCode]);
        return { userId, role, grants: await auth.loadGrants(userId, role) };
    }
    async function submitted(user, areaId, urgency = 'Urgent') {
        const patient = await requests.createPatient(user, { displayName: 'Test Patient', relationship: 'PARENT' });
        const draft = await requests.createRequest(user, {
            patientId: patient.id, requestedBloodGroup: 'O+', component: 'WHOLE_BLOOD', quantityUnits: 1,
            requiredBy: new Date(Date.now() + 86_400_000).toISOString(), urgency, contactPhone: `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, areaId: areaId ?? undefined,
        });
        return requests.submit(user, draft.id);
    }
    beforeAll(() => {
        db = new database_service_1.DatabaseService({ databaseUrl: url });
        const tokens = new token_service_1.TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' });
        const outbox = new outbox_service_1.OutboxService();
        const audit = new audit_service_1.AuditService(outbox);
        const history = new status_history_service_1.StatusHistoryService(audit);
        auth = new auth_service_1.AuthService(db, new password_service_1.PasswordService(), tokens, sms, outbox, audit);
        requests = new request_service_1.RequestService(db, new policy_service_1.PolicyService(), history, outbox);
        review = new review_service_1.ReviewService(db, new policy_service_1.PolicyService(), history, outbox);
    });
    afterAll(() => db.onModuleDestroy());
    it('takes the Support Agent starter permissions from the catalogue', async () => {
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', null);
        expect(agent.grants.map((g) => g.key)).toEqual(expect.arrayContaining(['blood_request.view', 'blood_request.approve']));
    });
    it('shows an area queue, picks up once, and creates the verify task', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const other = await newStaff('SUP', 'TIER_SUPPORT_AGENT', await newArea());
        const req = await submitted(patientUser, area);
        expect((await review.queue(agent)).map((r) => r.id)).toContain(req.id);
        expect((await review.queue(other)).map((r) => r.id)).not.toContain(req.id);
        await expect(review.detail(other, req.id)).rejects.toMatchObject({ status: 404 });
        await expect(review.pickUp(other, req.id)).rejects.toMatchObject({ status: 404 });
        const picked = await review.pickUp(agent, req.id);
        expect(picked).toMatchObject({ status: 'Under review', assignedSupportUserId: agent.userId });
        expect(picked.contactPhone).toMatch(/XXXX/);
        expect((await review.pickUp(agent, req.id)).status).toBe('Under review');
        const task = await db.query(`SELECT status FROM crd.case_task WHERE request_id = $1 AND task_type = 'TK_VERIFY_REQUEST'`, [req.id]);
        expect(task.rows).toEqual([{ status: 'In progress' }]);
    });
    it('refuses a second agent once the request is picked up', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const a = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const b = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const req = await submitted(patientUser, area);
        await review.pickUp(a, req.id);
        await expect(review.pickUp(b, req.id)).rejects.toMatchObject({ status: 409 });
        await expect(review.verify(b, req.id, fullChecklist)).rejects.toMatchObject({ status: 403 });
    });
    it('runs the needs-information loop and shows the missing items to the patient', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const req = await submitted(patientUser, area);
        await review.pickUp(agent, req.id);
        const asked = await review.requestInformation(agent, req.id, { items: ['DOCUMENT_ILLEGIBLE', 'FACILITY_UNCLEAR'], message: 'Please upload a clearer requisition' });
        expect(asked.status).toBe('Needs information');
        await expect(review.verify(agent, req.id, fullChecklist)).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
        const back = await requests.supplyInformation(patientUser, req.id, { message: 'Uploaded' });
        expect(back.status).toBe('Under review');
        await expect(requests.supplyInformation(patientUser, req.id, {})).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
        const timeline = await requests.timeline(patientUser, req.id);
        expect(timeline.map((t) => t.to)).toEqual(['Draft', 'Submitted', 'Under review', 'Needs information', 'Under review']);
        expect(timeline[3]).toMatchObject({ missingItems: ['DOCUMENT_ILLEGIBLE', 'FACILITY_UNCLEAR'] });
    });
    it('verifies only with a full checklist and no moderation hold', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const req = await submitted(patientUser, area);
        await review.pickUp(agent, req.id);
        await expect(review.verify(agent, req.id, { ...fullChecklist, noDuplicate: false })).rejects.toMatchObject({
            response: { code: 'CHECKLIST_INCOMPLETE', missing: ['NO_DUPLICATE'] },
        });
        await db.query('UPDATE req.blood_request SET has_moderation_hold = true WHERE id = $1', [req.id]);
        await expect(review.verify(agent, req.id, fullChecklist)).rejects.toMatchObject({ response: { code: 'MODERATION_REVIEW_IN_PROGRESS' } });
        await db.query('UPDATE req.blood_request SET has_moderation_hold = false WHERE id = $1', [req.id]);
        const verified = await review.verify(agent, req.id, fullChecklist);
        expect(verified.status).toBe('Verified');
        const row = await db.query('SELECT verified_at FROM req.blood_request WHERE id = $1', [req.id]);
        expect(row.rows[0].verified_at).not.toBeNull();
        const task = await db.query(`SELECT status FROM crd.case_task WHERE request_id = $1`, [req.id]);
        expect(task.rows[0].status).toBe('Done');
        const events = await db.query(`SELECT event_type FROM platform.outbox_event WHERE aggregate_id = $1`, [req.id]);
        expect(events.rows.map((e) => e.event_type)).toEqual(expect.arrayContaining(['RequestPickedUp', 'RequestVerified']));
    });
    it('rejects with a reason that the patient can see, and blocks further changes', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const req = await submitted(patientUser, area);
        await review.pickUp(agent, req.id);
        const rejected = await review.reject(agent, req.id, { reasonCode: 'DOCUMENT_INVALID', explanation: 'The requisition is not valid' });
        expect(rejected.status).toBe('Rejected');
        const timeline = await requests.timeline(patientUser, req.id);
        expect(timeline[timeline.length - 1]).toMatchObject({ to: 'Rejected', reasonCode: 'DOCUMENT_INVALID' });
        await expect(requests.cancel(patientUser, req.id, { reason: 'OTHER' })).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    });
    it('lets a moderator reject only a request that has a moderation hold', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const mod = await newStaff('MOD', 'TIER_MODERATOR', null);
        const req = await submitted(patientUser, area);
        await review.pickUp(agent, req.id);
        await expect(review.reject(mod, req.id, { reasonCode: 'SUSPECTED_MISUSE', explanation: 'Reused document' })).rejects.toMatchObject({
            response: { code: 'NO_MODERATION_HOLD' },
        });
        await db.query('UPDATE req.blood_request SET has_moderation_hold = true WHERE id = $1', [req.id]);
        expect((await review.reject(mod, req.id, { reasonCode: 'SUSPECTED_MISUSE', explanation: 'Reused document' })).status).toBe('Rejected');
    });
    it('orders the queue with critical requests first', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const routine = await submitted(patientUser, area, 'Routine');
        const critical = await submitted(patientUser, area, 'Critical');
        const ids = (await review.queue(agent)).map((r) => r.id);
        expect(ids.indexOf(critical.id)).toBeLessThan(ids.indexOf(routine.id));
    });
    it('flags a duplicate active request, blocks verification until resolved, and flags rapid submissions', async () => {
        const area = await newArea();
        const patientUser = await newPatientUser();
        const agent = await newStaff('SUP', 'TIER_SUPPORT_AGENT', area);
        const first = await submitted(patientUser, area);
        const patient = await db.query('SELECT patient_id, contact_phone FROM req.blood_request WHERE id = $1', [first.id]);
        const draft = await requests.createRequest(patientUser, {
            patientId: patient.rows[0].patient_id, requestedBloodGroup: 'O+', component: 'WHOLE_BLOOD', quantityUnits: 1,
            requiredBy: new Date(Date.now() + 86_400_000).toISOString(), urgency: 'Urgent', contactPhone: patient.rows[0].contact_phone, areaId: area,
        });
        const second = await requests.submit(patientUser, draft.id);
        await review.pickUp(agent, second.id);
        const detail = await review.detail(agent, second.id);
        expect(detail.flags).toEqual([expect.objectContaining({ flagType: 'DUPLICATE_ACTIVE', matchedRequestId: first.id, status: 'Open' })]);
        await expect(review.verify(agent, second.id, fullChecklist)).rejects.toMatchObject({ response: { code: 'UNRESOLVED_FLAGS' } });
        await review.resolveFlag(agent, second.id, detail.flags[0].id, { resolution: 'Dismissed', note: 'Different patient episode' });
        await expect(review.resolveFlag(agent, second.id, detail.flags[0].id, { resolution: 'Dismissed', note: 'again' })).rejects.toMatchObject({ status: 404 });
        expect((await review.verify(agent, second.id, fullChecklist)).status).toBe('Verified');
        const third = await submitted(patientUser, area);
        const fourth = await submitted(patientUser, area);
        const fifth = await submitted(patientUser, area);
        const flags = (await review.flags(fifth.id)).map((f) => f.flagType);
        expect(flags).toContain('RAPID_SUBMISSION');
        expect((await review.flags(third.id)).map((f) => f.flagType)).not.toContain('RAPID_SUBMISSION');
        expect(fourth.id).toBeDefined();
    });
});
//# sourceMappingURL=review.spec.js.map