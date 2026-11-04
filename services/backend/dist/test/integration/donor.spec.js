"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../src/platform/audit/audit.service");
const database_service_1 = require("../../src/platform/db/database.service");
const outbox_service_1 = require("../../src/platform/outbox/outbox.service");
const status_history_service_1 = require("../../src/platform/status/status-history.service");
const auth_service_1 = require("../../src/modules/identity/auth.service");
const donor_service_1 = require("../../src/modules/identity/donor.service");
const password_service_1 = require("../../src/modules/identity/password.service");
const sms_port_1 = require("../../src/modules/identity/sms.port");
const token_service_1 = require("../../src/modules/identity/token.service");
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
describe('donor helpers', () => {
    it('builds a donor code from unambiguous characters', () => {
        expect((0, donor_service_1.newDonorCode)()).toMatch(/^D[A-HJ-NP-Z2-9]{7}$/);
    });
    it('checks the Bangladesh bounding box', () => {
        expect((0, donor_service_1.insideBangladesh)(23.81, 90.41)).toBe(true);
        expect((0, donor_service_1.insideBangladesh)(28.6, 77.2)).toBe(false);
    });
    it('adds the contact interval to the last donation date', () => {
        expect((0, donor_service_1.nextContactDate)('2026-01-01')).toBe('2026-05-01');
    });
});
class CapturingSms extends sms_port_1.SmsSender {
    last = '';
    send(_phone, text) {
        this.last = /(\d{6})/.exec(text)[1];
        return Promise.resolve();
    }
}
suite('donor profile and consent (needs TEST_DATABASE_URL with all migrations applied)', () => {
    let db;
    let auth;
    let donors;
    const sms = new CapturingSms();
    const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const consent = { granted: true, policyVersion: 'v1', language: 'bn' };
    async function newDonorUser() {
        const p = phone();
        const { challengeId } = await auth.register({ phone: p, role: 'DON', language: 'bn' });
        const { setupToken } = await auth.verifyOtp({ challengeId, code: sms.last, role: 'DON', language: 'bn' });
        await auth.setPassword({
            setupToken,
            password: 'correct horse battery',
            device: { installId: (0, node_crypto_1.randomUUID)(), platform: 'android', model: 'T', osVersion: '14', appVersion: '1' },
        });
        const row = await db.query('SELECT id FROM idn.app_user WHERE phone_e164 = $1', [`+880${p.slice(1)}`]);
        const userId = row.rows[0].id;
        return { userId, role: 'DON', grants: await auth.loadGrants(userId, 'DON') };
    }
    beforeAll(() => {
        db = new database_service_1.DatabaseService({ databaseUrl: url });
        const tokens = new token_service_1.TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' });
        const outbox = new outbox_service_1.OutboxService();
        const audit = new audit_service_1.AuditService(outbox);
        auth = new auth_service_1.AuthService(db, new password_service_1.PasswordService(), tokens, sms, outbox, audit);
        donors = new donor_service_1.DonorService(db, new status_history_service_1.StatusHistoryService(audit), outbox);
    });
    afterAll(() => db.onModuleDestroy());
    it('gives a donor the starter profile, location and consent permissions', async () => {
        const user = await newDonorUser();
        expect(user.grants.map((g) => g.key)).toEqual(expect.arrayContaining(['donor_profile.edit', 'donor_location.manage_own', 'consent.manage_own']));
    });
    it('creates a profile with a donor code and default availability, and updates it in place', async () => {
        const user = await newDonorUser();
        await expect(donors.getProfile(user)).rejects.toMatchObject({ response: { code: 'DONOR_PROFILE_NOT_FOUND' } });
        const created = await donors.saveProfile(user, { bloodGroup: 'O+', lastDonationDate: '2026-01-01' });
        expect(created.donorCode).toMatch(/^D/);
        expect(created.nextContactBasis).toBe('SELF_REPORTED');
        expect(created.provisionalNextContactDate).toBe('2026-05-01');
        const availability = await donors.getAvailability(user);
        expect(availability).toMatchObject({ contactStart: '08:00', contactEnd: '21:00', routineAvailable: false });
        const updated = await donors.saveProfile(user, { bloodGroup: 'O+', travelRadiusKm: 25 });
        expect(updated.donorCode).toBe(created.donorCode);
        expect(updated.travelRadiusKm).toBe(25);
        expect(updated.lastDonationDate).toBe('2026-01-01');
    });
    it('refuses a future donation date and a locked blood group', async () => {
        const user = await newDonorUser();
        await expect(donors.saveProfile(user, { bloodGroup: 'A+', lastDonationDate: '2999-01-01' })).rejects.toMatchObject({
            response: { code: 'DATE_IN_FUTURE' },
        });
        await donors.saveProfile(user, { bloodGroup: 'A+' });
        await db.query(`UPDATE idn.donor_profile SET blood_group_status = 'Document-checked', blood_group_verified_at = now() WHERE user_id = $1`, [user.userId]);
        await expect(donors.saveProfile(user, { bloodGroup: 'B+' })).rejects.toMatchObject({ response: { code: 'BLOOD_GROUP_LOCKED' } });
    });
    it('validates availability', async () => {
        const user = await newDonorUser();
        await donors.saveProfile(user, { bloodGroup: 'B+' });
        const base = { routineAvailable: true, urgentAvailable: true, contactStart: '09:00', contactEnd: '18:00', contactDays: ['SAT', 'MON'] };
        await expect(donors.saveAvailability(user, { ...base, contactEnd: '08:00' })).rejects.toMatchObject({ response: { code: 'INVALID_CONTACT_WINDOW' } });
        const saved = await donors.saveAvailability(user, base);
        expect(saved).toMatchObject({ routineAvailable: true, contactDays: ['MON', 'SAT'] });
    });
    it('needs consent before a location, snaps it to the grid, and approves it on confirm', async () => {
        const user = await newDonorUser();
        await donors.saveProfile(user, { bloodGroup: 'O-' });
        const point = { latitude: 23.8103, longitude: 90.4125, source: 'DEVICE_SHARED' };
        await expect(donors.proposeLocation(user, point)).rejects.toMatchObject({ response: { code: 'CONSENT_REQUIRED' } });
        await donors.saveConsent(user, 'LOCATION_USE', consent);
        await expect(donors.proposeLocation(user, { ...point, latitude: 28.6, longitude: 77.2 })).rejects.toMatchObject({
            response: { code: 'LOCATION_OUTSIDE_SERVICE_AREA' },
        });
        const pending = await donors.proposeLocation(user, point);
        expect(pending.status).toBe('Pending');
        expect(Math.abs(pending.approximateLocation.latitude - point.latitude)).toBeLessThan(0.01);
        expect(pending.approximateLocation.latitude).not.toBe(point.latitude);
        expect(JSON.stringify(pending)).not.toContain('exact');
        const approved = await donors.confirmLocation(user, pending.id);
        expect(approved.status).toBe('Approved');
        const profile = await donors.getProfile(user);
        expect(profile.locationSource).toBe('APPROVED_LOCATION');
        expect(profile.approximateLocation).toEqual(approved.approximateLocation);
    });
    it('supersedes the older pending and approved locations', async () => {
        const user = await newDonorUser();
        await donors.saveProfile(user, { bloodGroup: 'AB+' });
        await donors.saveConsent(user, 'LOCATION_USE', consent);
        const first = await donors.proposeLocation(user, { latitude: 23.81, longitude: 90.41, source: 'MANUAL_PICK' });
        const second = await donors.proposeLocation(user, { latitude: 23.9, longitude: 90.3, source: 'MANUAL_PICK', gridSizeM: 2000 });
        await donors.confirmLocation(user, second.id);
        await expect(donors.confirmLocation(user, first.id)).rejects.toMatchObject({ status: 404 });
        const third = await donors.proposeLocation(user, { latitude: 24.0, longitude: 90.2, source: 'MANUAL_PICK' });
        await donors.confirmLocation(user, third.id);
        const history = await donors.listLocations(user);
        expect(history.map((l) => l.status).sort()).toEqual(['Approved', 'Superseded', 'Superseded']);
        const history2 = await db.query(`SELECT to_status FROM aud.status_history WHERE entity_type = 'DONOR_LOCATION' AND entity_id = $1 ORDER BY occurred_at`, [second.id]);
        expect(history2.rows.map((r) => r.to_status)).toEqual(['Pending', 'Approved', 'Superseded']);
    });
    it('keeps a new consent choice as a new row and publishes withdrawal', async () => {
        const user = await newDonorUser();
        await donors.saveProfile(user, { bloodGroup: 'O+' });
        await donors.saveConsent(user, 'URGENT_INVITATIONS', consent);
        await donors.saveConsent(user, 'URGENT_INVITATIONS', consent);
        await donors.saveConsent(user, 'URGENT_INVITATIONS', { ...consent, granted: false });
        const rows = await db.query('SELECT granted, withdrawn_at FROM idn.consent_record WHERE user_id = $1 ORDER BY created_at, id', [user.userId]);
        expect(rows.rowCount).toBe(2);
        expect(rows.rows.filter((r) => r.withdrawn_at === null)).toHaveLength(1);
        const events = await db.query(`SELECT event_type FROM platform.outbox_event WHERE payload->>'userId' = $1`, [user.userId]);
        expect(events.rows.map((r) => r.event_type)).toContain('ConsentWithdrawn');
        expect((await donors.listConsents(user))[0].granted).toBe(false);
        await expect(donors.saveConsent(user, 'TERMS', { ...consent, granted: false })).rejects.toMatchObject({
            response: { code: 'CONSENT_CANNOT_BE_WITHDRAWN' },
        });
    });
    it('falls back to the area when location consent is withdrawn', async () => {
        const user = await newDonorUser();
        await donors.saveProfile(user, { bloodGroup: 'O+' });
        await donors.saveConsent(user, 'LOCATION_USE', consent);
        const pending = await donors.proposeLocation(user, { latitude: 23.81, longitude: 90.41, source: 'DEVICE_SHARED' });
        await donors.confirmLocation(user, pending.id);
        await donors.saveConsent(user, 'LOCATION_USE', { ...consent, granted: false });
        const profile = await donors.getProfile(user);
        expect(profile.locationSource).toBe('AREA_CENTROID');
        expect(profile.approximateLocation).toBeNull();
    });
    it('lists every notification category and saves a preference', async () => {
        const user = await newDonorUser();
        expect(await donors.listNotificationPreferences(user)).toHaveLength(7);
        const saved = await donors.savePreference(user, 'INVITATIONS', { pushEnabled: true, smsEnabled: false, inappEnabled: true, quietStart: '22:00', quietEnd: '06:00' });
        expect(saved).toMatchObject({ category: 'INVITATIONS', pushEnabled: true, quietStart: '22:00' });
        await donors.savePreference(user, 'INVITATIONS', { pushEnabled: false, smsEnabled: false, inappEnabled: true });
        const all = await donors.listNotificationPreferences(user);
        expect(all.find((c) => c.category === 'INVITATIONS')).toMatchObject({ pushEnabled: false, quietStart: null });
        await expect(donors.savePreference(user, 'SYSTEM', { pushEnabled: true, smsEnabled: true, inappEnabled: true, quietStart: '22:00' })).rejects.toMatchObject({
            response: { code: 'QUIET_HOURS_INCOMPLETE' },
        });
    });
});
//# sourceMappingURL=donor.spec.js.map