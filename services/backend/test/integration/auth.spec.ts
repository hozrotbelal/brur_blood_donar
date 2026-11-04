import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { TokenService } from '../../src/platform/security/token.service';
import { AuthService, DeviceInfo, TokenPair } from '../../src/modules/identity/auth.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SmsSender } from '../../src/modules/identity/sms.port';
import { IdentityServices, buildIdentity, deviceProof, setupTokenOf, testDevice } from './identity-harness';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class CapturingSms extends SmsSender {
  last = '';
  sent = 0;
  send(_phone: string, text: string) {
    this.sent += 1;
    this.last = /(\d{6})/.exec(text)![1];
    return Promise.resolve();
  }
}

suite('auth flow (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let identity: IdentityServices;
  let tokens: TokenService;
  const sms = new CapturingSms();
  const device = (): DeviceInfo => testDevice();
  const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const password = 'correct horse battery';

  async function signUp(p: string, role: 'DON' | 'PAT' = 'DON') {
    const { challengeId } = await auth.register({ phone: p, role, language: 'bn' });
    const setupToken = setupTokenOf(await auth.verifyOtp({ challengeId, code: sms.last, role, language: 'bn' }));
    return auth.setPassword({ setupToken, password, device: device() });
  }

  async function newStaff(role: 'SUP' | 'ADM' = 'SUP') {
    const p = phone();
    const user = await db.query<{ id: string }>(
      `INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), true) RETURNING id`,
      [`+880${p.slice(1)}`],
    );
    await db.query(`INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = $2`, [user.rows[0].id, role]);
    await db.query(
      `INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at) VALUES ($1, $2, 'ARGON2ID', '{}'::jsonb, now())`,
      [user.rows[0].id, await new PasswordService().hash(password)],
    );
    return { phone: p, userId: user.rows[0].id };
  }

  async function staffSession(p: string, dev: DeviceInfo): Promise<TokenPair> {
    const challenge = (await auth.login({ phone: p, password, device: dev })) as { challengeId: string };
    return auth.verifyStaffMfa({ challengeId: challenge.challengeId, code: sms.last, device: dev });
  }

  beforeAll(async () => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
    tokens = new TokenService({ nodeEnv: 'test', jwtIssuer: 'bbda-test', jwtPrivateKeyPath: '', jwtVerifyKeyPaths: [] as string[] } as AppConfig);
    identity = buildIdentity(db, tokens, sms);
    auth = identity.auth;
  });
  afterAll(() => db.onModuleDestroy());

  it('registers, signs in and rotates device-bound refresh tokens, revoking the device on reuse', async () => {
    const p = phone();
    const first = await signUp(p);
    const claims = tokens.verify(first.accessToken, 'access');
    expect(claims?.role).toBe('DON');
    expect(claims?.aud).toBe('/api/v1');
    expect(claims?.iss).toBe('bbda-test');

    const dev = device();
    const login = (await auth.login({ phone: p, password, device: dev })) as TokenPair;
    await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({ response: { code: 'DEVICE_PROOF_INVALID' } });
    await expect(auth.refresh(login.refreshToken, deviceProof(device(), 'refresh', login.refreshToken))).rejects.toMatchObject({ response: { code: 'DEVICE_PROOF_INVALID' } });
    await expect(auth.refresh(login.refreshToken, deviceProof(dev, 'refresh', login.refreshToken, Date.now() - 10 * 60_000))).rejects.toMatchObject({ response: { code: 'DEVICE_PROOF_INVALID' } });

    const rotated = await auth.refresh(login.refreshToken, deviceProof(dev, 'refresh', login.refreshToken));
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(auth.refresh(login.refreshToken, deviceProof(dev, 'refresh', login.refreshToken))).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
    await expect(auth.refresh(rotated.refreshToken, deviceProof(dev, 'refresh', rotated.refreshToken))).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
  });

  it('loads grants for the active role only', async () => {
    const p = phone();
    const pair = await signUp(p, 'DON');
    const claims = tokens.verify(pair.accessToken, 'access')!;
    const donor = await auth.loadGrants(claims.sub!, 'DON');
    expect(donor.some((g) => g.key === 'donor_profile.edit')).toBe(true);
    expect(donor.some((g) => g.key === 'blood_request.create')).toBe(false);
    const asPatient = await auth.loadGrants(claims.sub!, 'PAT');
    expect(asPatient.some((g) => g.key === 'donor_profile.edit')).toBe(false);
  });

  it('rejects a wrong or reused OTP and a taken number', async () => {
    const p = phone();
    const { challengeId } = await auth.register({ phone: p, role: 'PAT', language: 'en' });
    await expect(auth.verifyOtp({ challengeId, code: '000000' === sms.last ? '111111' : '000000', role: 'PAT', language: 'en' })).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
    const setupToken = setupTokenOf(await auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'en' }));
    await expect(auth.verifyOtp({ challengeId, code: sms.last, role: 'PAT', language: 'en' })).rejects.toBeDefined();
    await auth.setPassword({ setupToken, password, device: device() });
    await expect(auth.setPassword({ setupToken, password, device: device() })).rejects.toMatchObject({ response: { code: 'ACCOUNT_EXISTS' } });
  });

  it('answers the same for unknown numbers, wrong passwords and locked accounts, then unlocks through forgot password', async () => {
    const p = phone();
    await signUp(p);
    await expect(auth.login({ phone: phone(), password, device: device() })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ phone: p, password: 'wrong password', device: device() })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    }
    await expect(auth.login({ phone: p, password, device: device() })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    const before = sms.sent;
    expect(await identity.passwordFlows.forgot({ phone: phone() })).toEqual({ accepted: true });
    expect(sms.sent).toBe(before);
    expect(await identity.passwordFlows.forgot({ phone: p })).toEqual({ accepted: true });
    expect(sms.sent).toBe(before + 1);
    const reset = await db.query<{ otp_challenge_id: string }>(
      `SELECT r.otp_challenge_id FROM idn.password_reset r JOIN idn.app_user u ON u.id = r.user_id WHERE u.phone_e164 = $1 ORDER BY r.requested_at DESC LIMIT 1`,
      [`+880${p.slice(1)}`],
    );
    const { resetToken } = (await auth.verifyOtp({ challengeId: reset.rows[0].otp_challenge_id, code: sms.last })) as { resetToken: string };
    await expect(identity.passwordFlows.reset({ resetToken, password: 'short', device: device() })).rejects.toMatchObject({ response: { code: 'PASSWORD_REJECTED' } });
    const outcome = await identity.passwordFlows.reset({ resetToken, password: 'a brand new passphrase', device: device() });
    expect(outcome.signedIn).toBe(true);
    await expect(identity.passwordFlows.reset({ resetToken, password: 'another passphrase', device: device() })).rejects.toMatchObject({ response: { code: 'RESET_TOKEN_INVALID' } });
    expect(((await auth.login({ phone: p, password: 'a brand new passphrase', device: device() })) as TokenPair).role).toBe('DON');
  });

  it('signs public users in with an SMS code and never staff', async () => {
    const p = phone();
    await signUp(p);
    expect(await auth.loginOtp({ phone: p })).toEqual({ accepted: true });
    const challenge = await db.query<{ id: string }>(
      `SELECT id FROM idn.otp_challenge WHERE phone_e164 = $1 AND purpose = 'LOGIN_FALLBACK' ORDER BY created_at DESC LIMIT 1`,
      [`+880${p.slice(1)}`],
    );
    await expect(auth.verifyOtp({ challengeId: challenge.rows[0].id, code: sms.last })).rejects.toMatchObject({ response: { code: 'DEVICE_REQUIRED' } });
    const pair = (await auth.verifyOtp({ challengeId: challenge.rows[0].id, code: sms.last, device: device() })) as TokenPair;
    expect(tokens.verify(pair.accessToken, 'access')?.role).toBe('DON');

    const staff = await newStaff();
    const before = sms.sent;
    expect(await auth.loginOtp({ phone: staff.phone })).toEqual({ accepted: true });
    expect(sms.sent).toBe(before);
  });

  it('changes a password with the current one, signs out other devices and keeps staff history', async () => {
    const p = phone();
    await signUp(p);
    const keep = device();
    const kept = (await auth.login({ phone: p, password, device: keep })) as TokenPair;
    const other = (await auth.login({ phone: p, password, device: device() })) as TokenPair;
    const principal = { userId: tokens.verify(kept.accessToken, 'access')!.sub!, role: 'DON' as const, sessionId: tokens.verify(kept.accessToken, 'access')!.sid, grants: [] };
    await expect(identity.passwordFlows.change(principal, { currentPassword: 'nope nope nope', newPassword: 'second passphrase here' })).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    const result = await identity.passwordFlows.change(principal, { currentPassword: password, newPassword: 'second passphrase here' });
    expect(result.otherSessionsRevoked).toBeGreaterThanOrEqual(1);
    expect(await auth.sessionIsActive(principal.sessionId!, principal.userId, 'DON')).toBe(true);
    await expect(auth.refresh(other.refreshToken)).rejects.toBeDefined();

    const staff = await newStaff();
    const dev = device();
    const session = await staffSession(staff.phone, dev);
    const staffPrincipal = { userId: staff.userId, role: 'SUP' as const, sessionId: tokens.verify(session.accessToken, 'access')!.sid, grants: [] };
    await identity.passwordFlows.change(staffPrincipal, { currentPassword: password, newPassword: 'staff passphrase one', signOutOtherDevices: false });
    await expect(identity.passwordFlows.change(staffPrincipal, { currentPassword: 'staff passphrase one', newPassword: password })).rejects.toMatchObject({ response: { code: 'PASSWORD_REJECTED', problems: ['REUSED'] } });
  });

  it('limits OTP requests per number', async () => {
    const p = phone();
    for (let i = 0; i < 3; i++) await auth.register({ phone: p, role: 'DON', language: 'bn' });
    await expect(auth.register({ phone: p, role: 'DON', language: 'bn' })).rejects.toMatchObject({ response: { code: 'OTP_RATE_LIMITED' } });
  });

  it('asks staff for an SMS code on a new device and skips it on a verified device', async () => {
    const staff = await newStaff();
    const p = staff.phone;
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

    await db.query(`UPDATE idn.device SET staff_mfa_verified_at = now() - interval '31 days' WHERE user_id = $1`, [staff.userId]);
    expect(await auth.login({ phone: p, password, device: dev })).toMatchObject({ mfaRequired: true });
  });

  it('lists sessions, signs out a device and reports a suspicious sign-in', async () => {
    const p = phone();
    await signUp(p);
    const a = device();
    const b = device();
    const pairA = (await auth.login({ phone: p, password, device: a })) as TokenPair;
    await auth.login({ phone: p, password, device: b });
    const claims = tokens.verify(pairA.accessToken, 'access')!;
    const principal = { userId: claims.sub!, role: 'DON' as const, sessionId: claims.sid, grants: [] };

    const listed = await identity.sessions.list(principal);
    expect(listed.sessions.length).toBeGreaterThanOrEqual(2);
    expect(listed.sessions.find((s) => s.current)?.sessionId).toBe(claims.sid);
    const otherDevice = listed.sessions.find((s) => !s.current)!;
    expect((await identity.sessions.signOutDevice(principal, otherDevice.deviceId)).revoked).toBeGreaterThanOrEqual(1);
    expect((await identity.sessions.list(principal)).sessions.some((s) => s.deviceId === otherDevice.deviceId)).toBe(false);

    const activity = await identity.sessions.loginActivity(principal);
    expect(activity.events.length).toBeGreaterThanOrEqual(3);
    const report = await identity.sessions.reportSuspicious(principal, (activity.events[0] as { id: string }).id);
    expect(report.nextStep).toBe('RESET_PASSWORD');
    expect(await auth.sessionIsActive(claims.sid!, claims.sub!, 'DON')).toBe(true);
  });

  it('records a step-up with the device key or an SMS code and keeps it for five minutes', async () => {
    const staff = await newStaff('ADM');
    const dev = device();
    const session = await staffSession(staff.phone, dev);
    const claims = tokens.verify(session.accessToken, 'access')!;
    const principal = { userId: staff.userId, role: 'ADM' as const, sessionId: claims.sid, grants: [] };

    expect((await auth.resolveSession(claims.sid!, staff.userId, 'ADM'))?.stepUpAt).toBeNull();
    await expect(identity.sessions.stepUp(principal, {})).rejects.toMatchObject({ response: { code: 'STEP_UP_PROOF_REQUIRED' } });
    await expect(identity.sessions.stepUp(principal, { proof: deviceProof(device(), 'step-up', claims.sid!) })).rejects.toMatchObject({ response: { code: 'DEVICE_PROOF_INVALID' } });
    const byKey = await identity.sessions.stepUp(principal, { proof: deviceProof(dev, 'step-up', claims.sid!) });
    expect(byKey.stepUpValidUntil.getTime()).toBeGreaterThan(Date.now());
    expect((await auth.resolveSession(claims.sid!, staff.userId, 'ADM'))?.stepUpAt).not.toBeNull();

    const challenge = await identity.sessions.stepUpChallenge(principal);
    await expect(identity.sessions.stepUp(principal, { challengeId: challenge.challengeId, code: sms.last === '000000' ? '000001' : '000000' })).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
    const byCode = await identity.sessions.stepUp(principal, { challengeId: challenge.challengeId, code: sms.last });
    expect(byCode.stepUpValidUntil.getTime()).toBeGreaterThan(Date.now());
  });
});
