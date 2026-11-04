import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SmsSender } from '../../src/modules/identity/sms.port';
import { TokenService } from '../../src/platform/security/token.service';
import { WebAuthService, WebContext, WebResult } from '../../src/modules/identity/web-auth.service';
import { buildAuth } from './identity-harness';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const ORIGIN = 'https://portal.example';

class CapturingSms extends SmsSender {
  last = '';
  send(_phone: string, text: string) {
    this.last = /(\d{6})/.exec(text)![1];
    return Promise.resolve();
  }
}

const cookieValue = (cookies: string[], name: string) => cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0].split('=')[1] ?? '';
const jar = (cookies: string[]) => cookies.filter((c) => !/Max-Age=0/.test(c)).map((c) => c.split(';')[0]).join('; ');

suite('staff web sign-in (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let tokens: TokenService;
  const sms = new CapturingSms();
  const password = 'correct horse battery';
  const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const web = (over: Partial<AppConfig> = {}) =>
    new WebAuthService(auth, { webOrigin: ORIGIN, webTrustedBrowserDays: 30, cookieSecure: true, ...over } as AppConfig);

  async function newStaff(isStaff = true) {
    const p = phone();
    const user = await db.query<{ id: string }>(
      `INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), $2) RETURNING id`,
      [`+880${p.slice(1)}`, isStaff],
    );
    const roleCode = isStaff ? 'SUP' : 'DON';
    await db.query(`INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = $2`, [user.rows[0].id, roleCode]);
    await db.query(
      `INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at) VALUES ($1, $2, 'ARGON2ID', '{}'::jsonb, now())`,
      [user.rows[0].id, await new PasswordService().hash(password)],
    );
    return p;
  }

  async function signIn(svc: WebAuthService, p: string, cookieHeader?: string): Promise<{ result: WebResult<any>; cookies: string[] }> {
    const first = await svc.login({ phone: p, password }, { origin: ORIGIN, cookieHeader });
    const browser = jar(first.cookies);
    if (!(first.body as any).mfaRequired) return { result: first, cookies: first.cookies };
    const second = await svc.verifyStaff({ challengeId: (first.body as any).challengeId, code: sms.last }, { origin: ORIGIN, cookieHeader: browser });
    return { result: second, cookies: [...first.cookies, ...second.cookies] };
  }

  beforeAll(() => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
    tokens = new TokenService({ nodeEnv: 'test', jwtIssuer: 'bbda', jwtPrivateKeyPath: '', jwtVerifyKeyPaths: [] as string[] } as AppConfig);
    const outbox = new OutboxService();
    auth = buildAuth(db, tokens, sms, outbox);
  });
  afterAll(() => db.onModuleDestroy());

  it('signs in with an SMS code, sets secure cookies, and keeps the refresh token out of the body', async () => {
    const svc = web();
    const p = await newStaff();
    const { result, cookies } = await signIn(svc, p);
    expect(tokens.verify(result.body.accessToken, 'access')?.role).toBe('SUP');
    expect(result.body.refreshToken).toBeUndefined();
    const rt = cookies.find((c) => c.startsWith('bbda_rt='))!;
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/Secure/);
    expect(rt).toMatch(/SameSite=Strict/);
    const csrf = cookies.find((c) => c.startsWith('bbda_csrf='))!;
    expect(csrf).not.toMatch(/HttpOnly/);
  });

  it('refreshes and signs out only with matching origin and CSRF token', async () => {
    const svc = web();
    const p = await newStaff();
    const { cookies } = await signIn(svc, p);
    const header = jar(cookies);
    const csrf = cookieValue(cookies, 'bbda_csrf');
    const ctx: WebContext = { origin: ORIGIN, cookieHeader: header, csrfHeader: csrf };

    await expect(svc.refresh({ ...ctx, csrfHeader: undefined })).rejects.toMatchObject({ response: { code: 'CSRF_INVALID' } });
    await expect(svc.refresh({ ...ctx, csrfHeader: 'wrong' })).rejects.toMatchObject({ response: { code: 'CSRF_INVALID' } });
    await expect(svc.refresh({ ...ctx, origin: 'https://evil.example' })).rejects.toMatchObject({ response: { code: 'ORIGIN_NOT_ALLOWED' } });
    await expect(svc.refresh({ ...ctx, origin: undefined })).rejects.toMatchObject({ response: { code: 'ORIGIN_REQUIRED' } });

    const next = await svc.refresh(ctx);
    expect(tokens.verify((next.body as any).accessToken, 'access')?.role).toBe('SUP');
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
    expect((again.body as any).mfaRequired).toBeUndefined();
    expect((again.body as any).accessToken).toBeDefined();

    expect(await web({ webTrustedBrowserDays: 0 }).login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser })).toMatchObject({ body: { mfaRequired: true } });

    await db.query(`UPDATE idn.device SET staff_mfa_verified_at = now() - interval '8 days' WHERE install_id = $1`, [cookieValue(first.cookies, 'bbda_bid')]);
    expect((await web({ webTrustedBrowserDays: 7 }).login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser })).body).toMatchObject({ mfaRequired: true });
  });

  it('does not trust the browser when the user opts out or the lifetime is zero', async () => {
    const p = await newStaff();
    const svc = web();
    const first = await svc.login({ phone: p, password }, { origin: ORIGIN });
    const browser = jar(first.cookies);
    await svc.verifyStaff({ challengeId: (first.body as any).challengeId, code: sms.last, trustBrowser: false }, { origin: ORIGIN, cookieHeader: browser });
    expect((await svc.login({ phone: p, password }, { origin: ORIGIN, cookieHeader: browser })).body).toMatchObject({ mfaRequired: true });
  });
});
