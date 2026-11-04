"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const audit_service_1 = require("../../src/platform/audit/audit.service");
const database_service_1 = require("../../src/platform/db/database.service");
const outbox_service_1 = require("../../src/platform/outbox/outbox.service");
const auth_service_1 = require("../../src/modules/identity/auth.service");
const password_service_1 = require("../../src/modules/identity/password.service");
const sms_port_1 = require("../../src/modules/identity/sms.port");
const token_service_1 = require("../../src/modules/identity/token.service");
const web_auth_service_1 = require("../../src/modules/identity/web-auth.service");
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const ORIGIN = 'https://portal.example';
class CapturingSms extends sms_port_1.SmsSender {
    last = '';
    send(_phone, text) {
        this.last = /(\d{6})/.exec(text)[1];
        return Promise.resolve();
    }
}
const cookieValue = (cookies, name) => cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0].split('=')[1] ?? '';
const jar = (cookies) => cookies.filter((c) => !/Max-Age=0/.test(c)).map((c) => c.split(';')[0]).join('; ');
suite('staff web sign-in (needs TEST_DATABASE_URL with all migrations applied)', () => {
    let db;
    let auth;
    let tokens;
    const sms = new CapturingSms();
    const password = 'correct horse battery';
    const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const web = (over = {}) => new web_auth_service_1.WebAuthService(auth, { webOrigin: ORIGIN, webTrustedBrowserDays: 30, cookieSecure: true, ...over });
    async function newStaff(isStaff = true) {
        const p = phone();
        const user = await db.query(`INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), $2) RETURNING id`, [`+880${p.slice(1)}`, isStaff]);
        const roleCode = isStaff ? 'SUP' : 'DON';
        await db.query(`INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = $2`, [user.rows[0].id, roleCode]);
        await db.query(`INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at) VALUES ($1, $2, 'ARGON2ID', '{}'::jsonb, now())`, [user.rows[0].id, await new password_service_1.PasswordService().hash(password)]);
        return p;
    }
    async function signIn(svc, p, cookieHeader) {
        const first = await svc.login({ phone: p, password }, { origin: ORIGIN, cookieHeader });
        const browser = jar(first.cookies);
        if (!first.body.mfaRequired)
            return { result: first, cookies: first.cookies };
        const second = await svc.verifyStaff({ challengeId: first.body.challengeId, code: sms.last }, { origin: ORIGIN, cookieHeader: browser });
        return { result: second, cookies: [...first.cookies, ...second.cookies] };
    }
    beforeAll(() => {
        db = new database_service_1.DatabaseService({ databaseUrl: url });
        tokens = new token_service_1.TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' });
        const outbox = new outbox_service_1.OutboxService();
        auth = new auth_service_1.AuthService(db, new password_service_1.PasswordService(), tokens, sms, outbox, new audit_service_1.AuditService(outbox));
    });
    afterAll(() => db.onModuleDestroy());
    it('signs in with an SMS code, sets secure cookies, and keeps the refresh token out of the body', async () => {
        const svc = web();
        const p = await newStaff();
        const { result, cookies } = await signIn(svc, p);
        expect(tokens.verify(result.body.accessToken, 'access')?.role).toBe('SUP');
        expect(result.body.refreshToken).toBeUndefined();
        const rt = cookies.find((c) => c.startsWith('bbda_rt='));
        expect(rt).toMatch(/HttpOnly/);
        expect(rt).toMatch(/Secure/);
        expect(rt).toMatch(/SameSite=Strict/);
        const csrf = cookies.find((c) => c.startsWith('bbda_csrf='));
        expect(csrf).not.toMatch(/HttpOnly/);
    });
    it('refreshes and signs out only with matching origin and CSRF token', async () => {
        const svc = web();
        const p = await newStaff();
        const { cookies } = await signIn(svc, p);
        const header = jar(cookies);
        const csrf = cookieValue(cookies, 'bbda_csrf');
        const ctx = { origin: ORIGIN, cookieHeader: header, csrfHeader: csrf };
        await expect(svc.refresh({ ...ctx, csrfHeader: undefined })).rejects.toMatchObject({ response: { code: 'CSRF_INVALID' } });
        await expect(svc.refresh({ ...ctx, csrfHeader: 'wrong' })).rejects.toMatchObject({ response: { code: 'CSRF_INVALID' } });
        await expect(svc.refresh({ ...ctx, origin: 'https://evil.example' })).rejects.toMatchObject({ response: { code: 'ORIGIN_NOT_ALLOWED' } });
        await expect(svc.refresh({ ...ctx, origin: undefined })).rejects.toMatchObject({ response: { code: 'ORIGIN_REQUIRED' } });
        const next = await svc.refresh(ctx);
        expect(tokens.verify(next.body.accessToken, 'access')?.role).toBe('SUP');
        const rotated = jar([...cookies.filter((c) => !c.startsWith('bbda_rt=') && !c.startsWith('bbda_csrf=')), ...next.cookies]);
        await expect(svc.refresh(ctx)).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
        const out = await svc.logout({ origin: ORIGIN, cookieHeader: rotated, csrfHeader: cookieValue(next.cookies, 'bbda_csrf') });
        expect(out.cookies.every((c) => /Max-Age=0/.test(c))).toBe(true);
        await expect(svc.refresh({ origin: ORIGIN, cookieHeader: rotated, csrfHeader: cookieValue(next.cookies, 'bbda_csrf') })).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
    });
    it('refuses non-staff accounts and an unconfigured portal', async () => {
        const p = await newStaff(false);
        await expect(web().login({ phone: p, password }, { origin: ORIGIN })).rejects.toMatchObject({ response: { code: 'STAFF_ONLY' } });
        await expect(web({ webOrigin: '' }).login({ phone: p, password }, { origin: ORIGIN })).rejects.toMatchObject({ response: { code: 'WEB_NOT_CONFIGURED' } });
        await expect(web().verifyStaff({ challengeId: '00000000-0000-4000-8000-000000000000', code: '123456' }, { origin: ORIGIN })).rejects.toMatchObject({ response: { code: 'BROWSER_ID_MISSING' } });
    });
    it('skips the SMS code on a trusted browser, and honours the configured lifetime', async () => {
        const svc = web();
        const p = await newStaff();
        const first = await signIn(svc, p);
        const browser = jar(first.cookies.filter((c) => c.startsWith('bbda_bid=')));
        const again = await svc.login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser });
        expect(again.body.mfaRequired).toBeUndefined();
        expect(again.body.accessToken).toBeDefined();
        expect(await web({ webTrustedBrowserDays: 0 }).login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser })).toMatchObject({ body: { mfaRequired: true } });
        await db.query(`UPDATE idn.device SET staff_mfa_verified_at = now() - interval '8 days' WHERE install_id = $1`, [cookieValue(first.cookies, 'bbda_bid')]);
        expect((await web({ webTrustedBrowserDays: 7 }).login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser })).body).toMatchObject({ mfaRequired: true });
    });
    it('does not trust the browser when the user opts out or the lifetime is zero', async () => {
        const p = await newStaff();
        const svc = web();
        const first = await svc.login({ phone: p, password }, { origin: ORIGIN });
        const browser = jar(first.cookies);
        await svc.verifyStaff({ challengeId: first.body.challengeId, code: sms.last, trustBrowser: false }, { origin: ORIGIN, cookieHeader: browser });
        expect((await svc.login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser })).body).toMatchObject({ mfaRequired: true });
    });
});
//# sourceMappingURL=web-auth.spec.js.map