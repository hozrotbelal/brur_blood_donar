import { randomUUID } from 'node:crypto';
import { AuditService } from '../../src/platform/audit/audit.service';
import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { AuthService, DeviceInfo, TokenPair } from '../../src/modules/identity/auth.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SmsSender } from '../../src/modules/identity/sms.port';
import { TokenService } from '../../src/modules/identity/token.service';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class CapturingSms extends SmsSender {
  last = '';
  send(_phone: string, text: string) {
    this.last = /(\d{6})/.exec(text)![1];
    return Promise.resolve();
  }
}

suite('auth flow (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let tokens: TokenService;
  const sms = new CapturingSms();
  const device = (): DeviceInfo => ({ installId: randomUUID(), platform: 'android', model: 'Test', osVersion: '14', appVersion: '0.1.0' });
  const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const password = 'correct horse battery';

  async function signUp(p: string) {
    const { challengeId } = await auth.register({ phone: p, role: 'DON', language: 'bn' });
    const { setupToken } = await auth.verifyOtp({ challengeId, code: sms.last, role: 'DON', language: 'bn' });
    return auth.setPassword({ setupToken, password, device: device() });
  }

  beforeAll(async () => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
    tokens = new TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' } as AppConfig);
    auth = new AuthService(db, new PasswordService(), tokens, sms, new OutboxService(), new AuditService(new OutboxService()));
  });
  afterAll(() => db.onModuleDestroy());

  it('registers, signs in and rotates refresh tokens, revoking the device on reuse', async () => {
    const p = phone();
    const first = await signUp(p);
    expect(tokens.verify(first.accessToken, 'access')?.role).toBe('DON');

    const dev = device();
    const login = (await auth.login({ phone: p, password, device: dev })) as TokenPair;
    const rotated = await auth.refresh(login.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
    await expect(auth.refresh(rotated.refreshToken)).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
  });

  it('rejects a wrong or reused OTP and a taken number', async () => {
    const p = phone();
    const { challengeId } = await auth.register({ phone: p, role: 'PAT', language: 'en' });
    await expect(auth.verifyOtp({ challengeId, code: '000000' === sms.last ? '111111' : '000000', role: 'PAT', language: 'en' })).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
    const { setupToken } = await auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'en' });
    await expect(auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'en' })).rejects.toBeDefined();
    await auth.setPassword({ setupToken, password, device: device() });
    await expect(auth.setPassword({ setupToken, password, device: device() })).rejects.toMatchObject({ response: { code: 'ACCOUNT_EXISTS' } });
  });

  it('answers the same for unknown numbers and wrong passwords, then locks after five failures', async () => {
    const p = phone();
    await signUp(p);
    await expect(auth.login({ phone: phone(), password, device: device() })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ phone: p, password: 'wrong password', device: device() })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    }
    await expect(auth.login({ phone: p, password, device: device() })).rejects.toMatchObject({ response: { code: 'ACCOUNT_LOCKED' } });
  });

  it('limits OTP requests per number', async () => {
    const p = phone();
    for (let i = 0; i < 3; i++) await auth.register({ phone: p, role: 'DON', language: 'bn' });
    await expect(auth.register({ phone: p, role: 'DON', language: 'bn' })).rejects.toMatchObject({ response: { code: 'OTP_RATE_LIMITED' } });
  });

  it('asks staff for an SMS code on a new device and skips it on a verified device', async () => {
    const passwords = new PasswordService();
    const p = phone();
    const user = await db.query<{ id: string }>(
      `INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), true) RETURNING id`,
      [`+880${p.slice(1)}`],
    );
    const userId = user.rows[0].id;
    await db.query(
      `INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = 'SUP'`,
      [userId],
    );
    await db.query(
      `INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at)
       VALUES ($1, $2, 'ARGON2ID', '{}'::jsonb, now())`,
      [userId, await passwords.hash(password)],
    );

    const dev = device();
    const challenge = await auth.login({ phone: p, password, device: dev });
    expect(challenge).toMatchObject({ mfaRequired: true });
    const { challengeId } = challenge as { challengeId: string };

    const goodCode = sms.last;
    await expect(auth.verifyStaffMfa({ challengeId, code: goodCode === '000000' ? '000001' : '000000', device: dev })).rejects.toMatchObject({
      response: { code: 'OTP_INVALID' },
    });
    const session = await auth.verifyStaffMfa({ challengeId, code: goodCode, device: dev });
    expect(session.role).toBe('SUP');
    expect(tokens.verify(session.accessToken, 'access')?.role).toBe('SUP');
    await expect(auth.verifyStaffMfa({ challengeId, code: goodCode, device: dev })).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });

    const again = (await auth.login({ phone: p, password, device: dev })) as TokenPair;
    expect(again.role).toBe('SUP');
    expect(await auth.login({ phone: p, password, device: device() })).toMatchObject({ mfaRequired: true });

    await db.query(`UPDATE idn.device SET staff_mfa_verified_at = now() - interval '31 days' WHERE user_id = $1`, [userId]);
    expect(await auth.login({ phone: p, password, device: dev })).toMatchObject({ mfaRequired: true });
  });
});
