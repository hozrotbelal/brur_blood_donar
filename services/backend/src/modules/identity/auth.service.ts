import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { Db, DatabaseService } from '../../platform/db/database.service';
import { Grant, PermissionScope } from '../../platform/policy/policy.types';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { OTP_MAX_ATTEMPTS, OTP_REQUESTS_PER_15_MIN, OTP_TTL_SECONDS, generateOtp, hashOtp, otpMatches } from './otp';
import { PasswordService } from './password.service';
import { checkPassword } from './password-policy';
import { normalizeBdPhone } from './phone';
import { SmsSender } from './sms.port';
import { TokenService } from './token.service';

export const ACCESS_TTL_SECONDS = 900;
export const SETUP_TTL_SECONDS = 900;
const PUBLIC_REFRESH_DAYS = 30;
const STAFF_REFRESH_DAYS = 1;
const STAFF_MFA_DAYS = 30;
const LOCK_AFTER_FAILURES = 5;
const LOCK_BASE_MINUTES = 15;
const LOCK_MAX_MINUTES = 1440;

export interface DeviceInfo {
  installId: string;
  platform: 'android' | 'ios';
  model: string;
  osVersion: string;
  appVersion: string;
  isRooted?: boolean;
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeId: string;
  expiresInSeconds: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  role: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (status: HttpStatus, code: string) => new HttpException({ code }, status);

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sms: SmsSender,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async register(input: { phone: string; role: 'DON' | 'PAT'; language: 'bn' | 'en'; ip?: string }) {
    const phone = normalizeBdPhone(input.phone);
    if (!phone) throw new BadRequestException({ code: 'INVALID_PHONE' });
    const recent = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM idn.otp_challenge
        WHERE phone_e164 = $1 AND purpose = 'REGISTRATION' AND created_at > now() - interval '15 minutes'`,
      [phone],
    );
    if (recent.rows[0].n >= OTP_REQUESTS_PER_15_MIN) throw fail(HttpStatus.TOO_MANY_REQUESTS, 'OTP_RATE_LIMITED');

    const challengeId = randomUUID();
    const code = generateOtp();
    await this.db.query(
      `INSERT INTO idn.otp_challenge (id, phone_e164, purpose, code_hash, expires_at, request_ip)
       VALUES ($1, $2, 'REGISTRATION', $3, now() + make_interval(secs => $4), $5)`,
      [challengeId, phone, hashOtp(challengeId, code), OTP_TTL_SECONDS, input.ip ?? null],
    );
    await this.sms.send(phone, `BBDA code: ${code}`);
    return { challengeId, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(input: { challengeId: string; code: string; role: 'DON' | 'PAT'; language: 'bn' | 'en' }) {
    const outcome = await this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ phone_e164: string; code_hash: string; attempts: number; expired: boolean; consumed_at: Date | null }>(
        `SELECT phone_e164, code_hash, attempts, consumed_at, expires_at <= now() AS expired
           FROM idn.otp_challenge WHERE id = $1 AND purpose = 'REGISTRATION' FOR UPDATE`,
        [input.challengeId],
      );
      const row = rows[0];
      if (!row || row.consumed_at || row.expired || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const };
      if (!otpMatches(input.challengeId, input.code, row.code_hash)) {
        await tx.query('UPDATE idn.otp_challenge SET attempts = attempts + 1 WHERE id = $1', [input.challengeId]);
        return { ok: false as const };
      }
      await tx.query('UPDATE idn.otp_challenge SET consumed_at = now() WHERE id = $1', [input.challengeId]);
      return { ok: true as const, phone: row.phone_e164 };
    });
    if (!outcome.ok) throw new BadRequestException({ code: 'OTP_INVALID' });
    const setupToken = this.tokens.issue(
      'setup',
      { phone: outcome.phone, role: input.role, lang: input.language, jti: input.challengeId },
      SETUP_TTL_SECONDS,
    );
    return { setupToken };
  }

  async setPassword(input: { setupToken: string; password: string; device: DeviceInfo; ip?: string }): Promise<TokenPair> {
    const claims = this.tokens.verify(input.setupToken, 'setup');
    if (!claims?.phone || !claims.role || !claims.jti) throw new UnauthorizedException({ code: 'SETUP_TOKEN_INVALID' });
    const problems = checkPassword(input.password, claims.phone);
    if (problems.length) throw new BadRequestException({ code: 'PASSWORD_REJECTED', problems });

    const hash = await this.passwords.hash(input.password);
    const refresh = this.newRefreshToken();
    return this.db.transaction(async (tx) => {
      const existing = await tx.query('SELECT 1 FROM idn.app_user WHERE phone_e164 = $1 AND deleted_at IS NULL', [claims.phone]);
      if (existing.rows.length) throw new ConflictException({ code: 'ACCOUNT_EXISTS' });

      const user = await tx.query<{ id: string }>(
        `INSERT INTO idn.app_user (phone_e164, phone_verified_at, preferred_language)
         VALUES ($1, now(), $2) RETURNING id`,
        [claims.phone, claims.lang === 'en' ? 'en' : 'bn'],
      );
      const userId = user.rows[0].id;
      await tx.query(
        `INSERT INTO idn.user_role (user_id, role_id, status, reason)
         SELECT $1, id, 'Active', NULL FROM idn.role WHERE code = $2`,
        [userId, claims.role],
      );
      await tx.query(
        `INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at)
         VALUES ($1, $2, 'ARGON2ID', '{"memoryKiB":19456,"timeCost":2,"parallelism":1}'::jsonb, now())`,
        [userId, hash],
      );
      const pair = await this.openSession(tx, userId, claims.role as string, input.device, refresh);
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'UserRegistered', payload: { role: claims.role } });
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId,
        actorRole: claims.role as 'DON' | 'PAT', entityType: 'app_user', entityId: userId, correlationId: randomUUID(),
      });
      return pair;
    });
  }

  async login(input: { phone: string; password: string; device: DeviceInfo; role?: string; ip?: string }): Promise<TokenPair | MfaChallenge> {
    const phone = normalizeBdPhone(input.phone);
    const lookup = sha256(phone ?? input.phone);
    const user = phone
      ? (
          await this.db.query<{ id: string; account_status: string; is_staff: boolean; password_hash: string; locked_until: Date | null; failed_attempts: number; lock_count_24h: number }>(
            `SELECT u.id, u.account_status, u.is_staff, c.password_hash, c.locked_until, c.failed_attempts, c.lock_count_24h
               FROM idn.app_user u JOIN idn.credential c ON c.user_id = u.id
              WHERE u.phone_e164 = $1 AND u.deleted_at IS NULL`,
            [phone],
          )
        ).rows[0]
      : undefined;

    if (!user) {
      await this.passwords.verify(await this.getDummyHash(), input.password).catch(() => false);
      await this.loginEvent(this.db, null, lookup, input, 'FAILED_PASSWORD');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      await this.loginEvent(this.db, user.id, lookup, input, 'LOCKED');
      throw fail(HttpStatus.LOCKED, 'ACCOUNT_LOCKED');
    }

    const valid = await this.passwords.verify(user.password_hash, input.password).catch(() => false);
    if (!valid) {
      const failures = user.failed_attempts + 1;
      const lock = failures >= LOCK_AFTER_FAILURES;
      const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** user.lock_count_24h, LOCK_MAX_MINUTES);
      await this.db.query(
        `UPDATE idn.credential SET failed_attempts = $2, lock_count_24h = lock_count_24h + $3,
                locked_until = CASE WHEN $3 = 1 THEN now() + make_interval(mins => $4) ELSE locked_until END, updated_at = now()
          WHERE user_id = $1`,
        [user.id, lock ? 0 : failures, lock ? 1 : 0, minutes],
      );
      await this.loginEvent(this.db, user.id, lookup, input, 'FAILED_PASSWORD');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    if (user.account_status !== 'Active') {
      await this.loginEvent(this.db, user.id, lookup, input, 'DENIED_POLICY');
      throw fail(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE');
    }
    if (user.is_staff && !(await this.deviceIsMfaTrusted(user.id, input.device.installId))) {
      return this.startStaffMfa(user.id, phone!, input.ip);
    }

    const refresh = this.newRefreshToken();
    return this.db.transaction(async (tx) => {
      const roles = await tx.query<{ code: string }>(
        `SELECT r.code FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.status = 'Active' ORDER BY r.code`,
        [user.id],
      );
      const role = input.role ?? roles.rows[0]?.code;
      if (!role || !roles.rows.some((r) => r.code === role)) throw fail(HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
      await tx.query('UPDATE idn.credential SET failed_attempts = 0, last_login_at = now(), updated_at = now() WHERE user_id = $1', [user.id]);
      await tx.query('UPDATE idn.app_user SET last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);
      const pair = await this.openSession(tx, user.id, role, input.device, refresh, user.is_staff ? STAFF_REFRESH_DAYS : PUBLIC_REFRESH_DAYS);
      await this.loginEvent(tx, user.id, lookup, input, 'SUCCESS');
      await this.audit.record(tx, {
        category: 'AUTH', action: 'LOGIN_SUCCESS', result: 'SUCCESS', actorUserId: user.id,
        actorRole: role as 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM', correlationId: randomUUID(),
      });
      return pair;
    });
  }

  async verifyStaffMfa(input: { challengeId: string; code: string; device: DeviceInfo; role?: string; ip?: string }): Promise<TokenPair> {
    const outcome = await this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ user_id: string; phone_e164: string; code_hash: string; attempts: number; expired: boolean; consumed_at: Date | null }>(
        `SELECT user_id, phone_e164, code_hash, attempts, consumed_at, expires_at <= now() AS expired
           FROM idn.otp_challenge WHERE id = $1 AND purpose = 'STAFF_MFA' FOR UPDATE`,
        [input.challengeId],
      );
      const row = rows[0];
      if (!row || !row.user_id || row.consumed_at || row.expired || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const };
      if (!otpMatches(input.challengeId, input.code, row.code_hash)) {
        await tx.query('UPDATE idn.otp_challenge SET attempts = attempts + 1 WHERE id = $1', [input.challengeId]);
        return { ok: false as const };
      }
      await tx.query('UPDATE idn.otp_challenge SET consumed_at = now() WHERE id = $1', [input.challengeId]);
      return { ok: true as const, userId: row.user_id, phone: row.phone_e164 };
    });
    if (!outcome.ok) throw new BadRequestException({ code: 'OTP_INVALID' });

    const refresh = this.newRefreshToken();
    return this.db.transaction(async (tx) => {
      const roles = await tx.query<{ code: string }>(
        `SELECT r.code FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.status = 'Active' AND r.is_staff ORDER BY r.code`,
        [outcome.userId],
      );
      const role = input.role ?? roles.rows[0]?.code;
      if (!role || !roles.rows.some((r) => r.code === role)) throw fail(HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
      const pair = await this.openSession(tx, outcome.userId, role, input.device, refresh, STAFF_REFRESH_DAYS);
      await tx.query(
        'UPDATE idn.device SET staff_mfa_verified_at = now() WHERE user_id = $1 AND install_id = $2',
        [outcome.userId, input.device.installId],
      );
      await tx.query('UPDATE idn.credential SET failed_attempts = 0, last_login_at = now(), updated_at = now() WHERE user_id = $1', [outcome.userId]);
      await tx.query('UPDATE idn.app_user SET last_login_at = now(), updated_at = now() WHERE id = $1', [outcome.userId]);
      await this.loginEvent(tx, outcome.userId, sha256(outcome.phone), input, 'SUCCESS', 'STAFF_2STEP');
      await this.audit.record(tx, {
        category: 'AUTH', action: 'LOGIN_SUCCESS', result: 'SUCCESS', actorUserId: outcome.userId,
        actorRole: role as 'SUP' | 'MOD' | 'ADM', correlationId: randomUUID(),
      });
      return pair;
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = sha256(refreshToken);
    const result = await this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; user_id: string; device_id: string; active_role: string; revoked: boolean; expired: boolean; superseded: boolean }>(
        `SELECT s.id, s.user_id, s.device_id, s.active_role, s.revoked_at IS NOT NULL AS revoked, s.expires_at <= now() AS expired,
                EXISTS (SELECT 1 FROM idn.session c WHERE c.rotated_from_id = s.id) AS superseded
           FROM idn.session s WHERE s.refresh_token_hash = $1 FOR UPDATE`,
        [hash],
      );
      const session = rows[0];
      if (!session || session.revoked || session.expired) return { ok: false as const };
      if (session.superseded) {
        await tx.query(
          `UPDATE idn.session SET revoked_at = now(), revoke_reason = 'ROTATION_REUSE'
            WHERE device_id = $1 AND revoked_at IS NULL`,
          [session.device_id],
        );
        return { ok: false as const };
      }
      const next = this.newRefreshToken();
      const created = await tx.query<{ id: string }>(
        `INSERT INTO idn.session (user_id, device_id, refresh_token_hash, rotated_from_id, active_role, expires_at)
         SELECT user_id, device_id, $2, id, active_role, expires_at FROM idn.session WHERE id = $1 RETURNING id`,
        [session.id, next.hash],
      );
      return { ok: true as const, pair: this.pair(session.user_id, created.rows[0].id, session.active_role, next.token) };
    });
    if (!result.ok) throw new UnauthorizedException({ code: 'REFRESH_INVALID' });
    return result.pair;
  }

  async logout(sessionId: string, userId: string, role: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE idn.session SET revoked_at = now(), revoke_reason = 'LOGOUT' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [sessionId, userId],
      );
      await this.audit.record(tx, {
        category: 'AUTH', action: 'LOGOUT', result: 'SUCCESS', actorUserId: userId,
        actorRole: role as 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM', correlationId: randomUUID(),
      });
    });
  }

  async loadGrants(userId: string, role: string): Promise<Grant[]> {
    const { rows } = await this.db.query<{ key: string; scope: PermissionScope; expires_at: Date | null }>(
      `SELECT p.key, i.scope, NULL::timestamptz AS expires_at
         FROM idn.permission_set s
         JOIN idn.permission_set_item i ON i.permission_set_id = s.id
         JOIN idn.permission p ON p.id = i.permission_id
        WHERE s.kind = 'BASE' AND s.status = 'Active' AND s.role_code = $2
       UNION ALL
       SELECT key, scope, expires_at FROM idn.v_effective_permission WHERE user_id = $1`,
      [userId, role],
    );
    return rows.map((r) => ({ key: r.key, scope: r.scope, expiresAt: r.expires_at }));
  }

  async sessionIsActive(sessionId: string, userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM idn.session s JOIN idn.app_user u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.account_status = 'Active'`,
      [sessionId, userId],
    );
    return rows.length > 0;
  }

  private async deviceIsMfaTrusted(userId: string, installId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM idn.device WHERE user_id = $1 AND install_id = $2 AND sign_out_status = 'Active'
          AND staff_mfa_verified_at > now() - make_interval(days => $3)`,
      [userId, installId, STAFF_MFA_DAYS],
    );
    return rows.length > 0;
  }

  private async startStaffMfa(userId: string, phone: string, ip?: string): Promise<MfaChallenge> {
    const recent = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM idn.otp_challenge
        WHERE phone_e164 = $1 AND purpose = 'STAFF_MFA' AND created_at > now() - interval '15 minutes'`,
      [phone],
    );
    if (recent.rows[0].n >= OTP_REQUESTS_PER_15_MIN) throw fail(HttpStatus.TOO_MANY_REQUESTS, 'OTP_RATE_LIMITED');
    const challengeId = randomUUID();
    const code = generateOtp();
    await this.db.query(
      `INSERT INTO idn.otp_challenge (id, phone_e164, user_id, purpose, code_hash, expires_at, request_ip)
       VALUES ($1, $2, $3, 'STAFF_MFA', $4, now() + make_interval(secs => $5), $6)`,
      [challengeId, phone, userId, hashOtp(challengeId, code), OTP_TTL_SECONDS, ip ?? null],
    );
    await this.sms.send(phone, `BBDA code: ${code}`);
    return { mfaRequired: true, challengeId, expiresInSeconds: OTP_TTL_SECONDS };
  }

  private newRefreshToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: sha256(token) };
  }

  private pair(userId: string, sessionId: string, role: string, refreshToken: string): TokenPair {
    return {
      accessToken: this.tokens.issue('access', { sub: userId, sid: sessionId, role }, ACCESS_TTL_SECONDS),
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      role,
    };
  }

  private async openSession(tx: Db, userId: string, role: string, device: DeviceInfo, refresh: { token: string; hash: string }, refreshDays = PUBLIC_REFRESH_DAYS): Promise<TokenPair> {
    const dev = await tx.query<{ id: string }>(
      `INSERT INTO idn.device (user_id, install_id, platform, device_model, os_version, app_version, is_rooted)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, install_id) DO UPDATE
         SET device_model = EXCLUDED.device_model, os_version = EXCLUDED.os_version, app_version = EXCLUDED.app_version,
             is_rooted = EXCLUDED.is_rooted, last_seen_at = now(), sign_out_status = 'Active', updated_at = now()
       RETURNING id`,
      [userId, device.installId, device.platform, device.model, device.osVersion, device.appVersion, device.isRooted ?? false],
    );
    const session = await tx.query<{ id: string }>(
      `INSERT INTO idn.session (user_id, device_id, refresh_token_hash, active_role, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id`,
      [userId, dev.rows[0].id, refresh.hash, role, refreshDays],
    );
    return this.pair(userId, session.rows[0].id, role, refresh.token);
  }

  private async loginEvent(db: Db, userId: string | null, lookup: string, input: { device: DeviceInfo; ip?: string }, result: string, method = 'PASSWORD') {
    await db.query(
      `INSERT INTO idn.login_event (user_id, phone_lookup_hash, method, result, device_model, os_version, app_version, is_rooted,
                                   ip_hash, location_source, risk_flags)
       VALUES ($1, $2, $9, $3, $4, $5, $6, $7, $8, 'NOT_SHARED', '{}')`,
      [userId, lookup, result, input.device.model, input.device.osVersion, input.device.appVersion, input.device.isRooted ?? false, input.ip ? sha256(input.ip) : null, method],
    );
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomUUID());
    return this.dummyHash;
  }
}
