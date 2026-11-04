import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { Db, DatabaseService } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { RoleCode } from '../../platform/policy/policy.types';
import { normalizeDevicePublicKey } from '../../platform/security/device-proof';
import { TokenService } from '../../platform/security/token.service';
import { OTP_MAX_ATTEMPTS, OTP_REQUESTS_PER_15_MIN, OTP_TTL_SECONDS, generateOtp, hashOtp, otpMatches } from './otp';
import { appUser, credential, device, loginEvent, otpChallenge, role, session, userRole } from './schema';
import { SmsSender } from './sms.port';

export const ACCESS_TTL_SECONDS = 900;
export const SETUP_TTL_SECONDS = 900;
export const RESET_TOKEN_TTL_MINUTES = 10;
export const PUBLIC_REFRESH_DAYS = 30;
export const STAFF_REFRESH_DAYS = 7;
export const STAFF_MFA_DAYS = 30;
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_BASE_MINUTES = 15;
export const LOCK_MAX_MINUTES = 1440;
export const OTP_REQUESTS_PER_DAY = 10;
export const OTP_REQUESTS_PER_IP_PER_DAY = 20;
export const LOGIN_FAILURES_PER_IP_PER_15_MIN = 20;
export const STAFF_PASSWORD_HISTORY = 5;

export type OtpPurpose = (typeof otpChallenge.$inferSelect)['purpose'];
export type SecurityAlertKind = 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'NEW_DEVICE' | 'ACCOUNT_LOCKED' | 'SUSPICIOUS_SIGN_IN_REPORTED';
export type SessionRevokeReason = NonNullable<(typeof session.$inferSelect)['revokeReason']>;
export type LoginMethod = 'PASSWORD' | 'SMS_CODE' | 'STAFF_2STEP';
export type LoginResult = (typeof loginEvent.$inferSelect)['result'];
export type RiskFlag = (typeof loginEvent.$inferSelect)['riskFlags'][number];

export interface DeviceInfo {
  installId: string;
  platform: 'android' | 'ios' | 'web';
  model: string;
  osVersion: string;
  appVersion: string;
  isRooted?: boolean;
  publicKey?: string;
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

export interface OpenedSession {
  pair: TokenPair;
  sessionId: string;
  deviceId: string;
  isNewDevice: boolean;
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const fail = (status: HttpStatus, code: string) => new HttpException({ code }, status);
export const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

@Injectable()
export class AuthSupport {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly tokens: TokenService,
    private readonly sms: SmsSender,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async otpAllowed(db: Db, phone: string, purpose: OtpPurpose, ip?: string): Promise<boolean> {
    const ipFilter = ip ? sql`${otpChallenge.requestIp} = ${ip}::inet` : sql`false`;
    const [r] = await db.orm
      .select({
        recent: sql<number>`count(*) filter (where ${otpChallenge.phoneE164} = ${phone} and ${otpChallenge.purpose} = ${purpose}::otp_purpose and ${otpChallenge.createdAt} > now() - interval '15 minutes')`.mapWith(Number),
        day: sql<number>`count(*) filter (where ${otpChallenge.phoneE164} = ${phone})`.mapWith(Number),
        ipDay: sql<number>`count(*) filter (where ${ipFilter})`.mapWith(Number),
      })
      .from(otpChallenge)
      .where(and(gt(otpChallenge.createdAt, sql`now() - interval '24 hours'`), sql`(${otpChallenge.phoneE164} = ${phone} or ${ipFilter})`));
    return r.recent < OTP_REQUESTS_PER_15_MIN && r.day < OTP_REQUESTS_PER_DAY && r.ipDay < OTP_REQUESTS_PER_IP_PER_DAY;
  }

  async createOtp(db: Db, input: { phone: string; purpose: OtpPurpose; userId?: string | null; ip?: string }) {
    const challengeId = randomUUID();
    const code = generateOtp();
    await db.orm.insert(otpChallenge).values({
      id: challengeId, phoneE164: input.phone, userId: input.userId ?? null, purpose: input.purpose, codeHash: hashOtp(challengeId, code),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000), requestIp: input.ip ?? null,
    });
    return { challengeId, code, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async issueOtp(db: Db, input: { phone: string; purpose: OtpPurpose; userId?: string | null; ip?: string }) {
    if (!(await this.otpAllowed(db, input.phone, input.purpose, input.ip))) throw fail(HttpStatus.TOO_MANY_REQUESTS, 'OTP_RATE_LIMITED');
    const otp = await this.createOtp(db, input);
    await this.sendCode(input.phone, otp.code);
    return { challengeId: otp.challengeId, expiresInSeconds: otp.expiresInSeconds };
  }

  sendCode(phone: string, code: string): Promise<void> {
    return this.sms.send(phone, `BBDA code: ${code}. It expires in ${OTP_TTL_SECONDS / 60} minutes. Never share it.`);
  }

  async purposeOf(db: Db, challengeId: string): Promise<OtpPurpose | null> {
    const [row] = await db.orm.select({ purpose: otpChallenge.purpose }).from(otpChallenge).where(eq(otpChallenge.id, challengeId));
    return row?.purpose ?? null;
  }

  async consumeOtp(tx: Db, challengeId: string, code: string, purpose: OtpPurpose): Promise<{ ok: true; phone: string; userId: string | null } | { ok: false }> {
    const [row] = await tx.orm
      .select({ phone: otpChallenge.phoneE164, userId: otpChallenge.userId, codeHash: otpChallenge.codeHash, attempts: otpChallenge.attempts, consumedAt: otpChallenge.consumedAt, expired: sql<boolean>`${otpChallenge.expiresAt} <= now()` })
      .from(otpChallenge)
      .where(and(eq(otpChallenge.id, challengeId), eq(otpChallenge.purpose, purpose)))
      .for('no key update');
    if (!row || row.consumedAt || row.expired || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false };
    if (!otpMatches(challengeId, code, row.codeHash)) {
      await tx.orm.update(otpChallenge).set({ attempts: sql`${otpChallenge.attempts} + 1` }).where(eq(otpChallenge.id, challengeId));
      return { ok: false };
    }
    await tx.orm.update(otpChallenge).set({ consumedAt: new Date() }).where(eq(otpChallenge.id, challengeId));
    return { ok: true, phone: row.phone, userId: row.userId };
  }

  newRefreshToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: sha256(token) };
  }

  pair(userId: string, sessionId: string, roleCode: string, refreshToken: string): TokenPair {
    return {
      accessToken: this.tokens.issue('access', { sub: userId, sid: sessionId, role: roleCode }, ACCESS_TTL_SECONDS),
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      role: roleCode,
    };
  }

  async openSession(tx: Db, userId: string, roleCode: string, info: DeviceInfo, refresh: { token: string; hash: string }, refreshDays: number): Promise<OpenedSession> {
    let publicKey: string | null = null;
    if (info.platform !== 'web') {
      publicKey = info.publicKey ? normalizeDevicePublicKey(info.publicKey) : null;
      if (!publicKey) throw fail(HttpStatus.BAD_REQUEST, 'DEVICE_KEY_INVALID');
    }
    const [dev] = await tx.orm
      .insert(device)
      .values({
        userId, installId: info.installId, platform: info.platform, deviceModel: info.model, osVersion: info.osVersion, appVersion: info.appVersion,
        isRooted: info.isRooted ?? false, publicKey,
      })
      .onConflictDoUpdate({
        target: [device.userId, device.installId],
        set: {
          deviceModel: sql`excluded.device_model`, osVersion: sql`excluded.os_version`, appVersion: sql`excluded.app_version`, isRooted: sql`excluded.is_rooted`,
          publicKey: sql`coalesce(excluded.public_key, ${device.publicKey})`, lastSeenAt: sql`now()`, signOutStatus: 'Active', signedOutAt: null, revokedAt: null, updatedAt: sql`now()`,
        },
      })
      .returning({ id: device.id, inserted: sql<boolean>`(xmax = 0)` });
    const [created] = await tx.orm
      .insert(session)
      .values({ userId, deviceId: dev.id, refreshTokenHash: refresh.hash, activeRole: roleCode as RoleCode, expiresAt: new Date(Date.now() + refreshDays * 86_400_000) })
      .returning({ id: session.id });
    return { pair: this.pair(userId, created.id, roleCode, refresh.token), sessionId: created.id, deviceId: dev.id, isNewDevice: dev.inserted };
  }

  async revokeSessions(
    tx: Db,
    userId: string,
    reason: SessionRevokeReason,
    actor: { userId: string | null; role: RoleCode | 'SYSTEM' },
    options: { exceptSessionId?: string; deviceId?: string } = {},
  ): Promise<number> {
    const res = await tx.orm
      .update(session)
      .set({ revokedAt: new Date(), revokeReason: reason, updatedAt: new Date() })
      .where(
        and(
          eq(session.userId, userId), isNull(session.revokedAt),
          options.exceptSessionId ? ne(session.id, options.exceptSessionId) : undefined,
          options.deviceId ? eq(session.deviceId, options.deviceId) : undefined,
        ),
      );
    const count = res.rowCount ?? 0;
    if (count > 0) {
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'SessionsRevoked', payload: { reason, count } });
      await this.audit.record(tx, {
        category: 'AUTH', action: 'SESSIONS_REVOKED', result: 'SUCCESS', actorUserId: actor.userId, actorRole: actor.role,
        subjectUserId: userId, reasonCode: reason, changes: { count }, correlationId: randomUUID(),
      });
    }
    return count;
  }

  async securityAlert(tx: Db, userId: string, roleCode: RoleCode, kind: SecurityAlertKind, details: Record<string, unknown> = {}): Promise<void> {
    await this.outbox.append(tx, {
      aggregateType: 'APP_USER', aggregateId: userId, eventType: 'SecurityAlertRaised',
      payload: { kind, role: roleCode, occurredAt: new Date().toISOString(), ...details },
    });
  }

  async loginEvent(
    db: Db,
    input: { userId: string | null; lookup: string; device: DeviceInfo; ip?: string; result: LoginResult; method: LoginMethod; sessionId?: string; deviceId?: string; isNewDevice?: boolean; riskFlags?: RiskFlag[] },
  ): Promise<string> {
    const [row] = await db.orm
      .insert(loginEvent)
      .values({
        userId: input.userId, phoneLookupHash: input.lookup, deviceId: input.deviceId ?? null, sessionId: input.sessionId ?? null, method: input.method, result: input.result,
        deviceModel: input.device.model, osVersion: input.device.osVersion, appVersion: input.device.appVersion, isNewDevice: input.isNewDevice ?? false,
        isRooted: input.device.isRooted ?? false, ipHash: input.ip ? sha256(input.ip) : null, locationSource: 'NOT_SHARED', riskFlags: input.riskFlags ?? [],
      })
      .returning({ id: loginEvent.id });
    return row.id;
  }

  async loginRateLimited(db: Db, ip?: string): Promise<boolean> {
    if (!ip) return false;
    const [r] = await db.orm
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(loginEvent)
      .where(and(eq(loginEvent.ipHash, sha256(ip)), ne(loginEvent.result, 'SUCCESS'), gt(loginEvent.occurredAt, sql`now() - interval '15 minutes'`)));
    return r.n >= LOGIN_FAILURES_PER_IP_PER_15_MIN;
  }

  async activeRoles(db: Db, userId: string, staffOnly = false): Promise<RoleCode[]> {
    const rows = await db.orm
      .select({ code: role.code })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(and(eq(userRole.userId, userId), eq(userRole.status, 'Active'), staffOnly ? eq(role.isStaff, true) : undefined))
      .orderBy(desc(role.isStaff), asc(role.code));
    return rows.map((r) => r.code);
  }

  async markSignedIn(tx: Db, userId: string): Promise<void> {
    await tx.orm.update(credential).set({ failedAttempts: 0, lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(credential.userId, userId));
    await tx.orm.update(appUser).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(appUser.id, userId));
  }

  async recordLoginSuccess(tx: Db, userId: string, roleCode: RoleCode): Promise<void> {
    await this.audit.record(tx, { category: 'AUTH', action: 'LOGIN_SUCCESS', result: 'SUCCESS', actorUserId: userId, actorRole: roleCode, correlationId: randomUUID() });
  }

  async recordLoginFailure(tx: Db, userId: string | null, reason: string): Promise<void> {
    await this.audit.record(tx, {
      category: 'AUTH', action: 'LOGIN_FAILED', result: 'FAILED', actorUserId: null, actorRole: 'SYSTEM', subjectUserId: userId ?? undefined,
      reasonCode: reason, correlationId: randomUUID(),
    });
  }

  get database(): DatabaseService {
    return this.db;
  }

}
