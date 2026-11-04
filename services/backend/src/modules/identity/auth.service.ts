import { BadRequestException, ConflictException, HttpStatus, Inject, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { and, eq, exists, gt, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { APP_CONFIG, AppConfig } from '../../platform/config/app-config';
import { Db, DatabaseService } from '../../platform/db/database.service';
import { Grant, PermissionScope, RoleCode } from '../../platform/policy/policy.types';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { DeviceProof, verifyDeviceProof } from '../../platform/security/device-proof';
import { TokenService } from '../../platform/security/token.service';
import {
  AuthSupport, DeviceInfo, LOCK_AFTER_FAILURES, LOCK_BASE_MINUTES, LOCK_MAX_MINUTES, MfaChallenge, PUBLIC_REFRESH_DAYS, SETUP_TTL_SECONDS,
  STAFF_MFA_DAYS, STAFF_REFRESH_DAYS, TokenPair, fail, minutesFromNow, sha256,
} from './auth.support';
import { PasswordFlowService } from './password-flow.service';
import { PasswordService } from './password.service';
import { checkPassword } from './password-policy';
import { normalizeBdPhone } from './phone';
import { appUser, credential, device, permission, permissionSet, permissionSetItem, role, session, userPermissionSet, userRole } from './schema';

export { ACCESS_TTL_SECONDS, SETUP_TTL_SECONDS } from './auth.support';
export type { DeviceInfo, MfaChallenge, TokenPair } from './auth.support';

export interface SessionState {
  stepUpAt: Date | null;
  deviceId: string;
}

interface CredentialRow {
  id: string;
  accountStatus: string;
  isStaff: boolean;
  passwordHash: string;
  lockedUntil: Date | null;
  failedAttempts: number;
  lockCount24h: number;
}

const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;
  private readonly skipStaffSmsCode: boolean;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly support: AuthSupport,
    private readonly passwordFlows: PasswordFlowService,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
  ) {
    this.skipStaffSmsCode = config?.devSkipStaffSmsCode === true && (config.nodeEnv === 'development' || config.nodeEnv === 'test');
    if (this.skipStaffSmsCode) new Logger(AuthService.name).warn('DEV_SKIP_STAFF_SMS_CODE is on: staff sign in without the SMS second step (development only)');
  }

  async register(input: { phone: string; role: 'DON' | 'PAT'; language: 'bn' | 'en'; ip?: string }) {
    const phone = normalizeBdPhone(input.phone);
    if (!phone) throw new BadRequestException({ code: 'INVALID_PHONE' });
    return this.support.issueOtp(this.db, { phone, purpose: 'REGISTRATION', ip: input.ip });
  }

  async loginOtp(input: { phone: string; ip?: string }): Promise<{ accepted: true }> {
    const phone = normalizeBdPhone(input.phone);
    if (phone && (await this.support.otpAllowed(this.db, phone, 'LOGIN_FALLBACK', input.ip))) {
      const [user] = await this.db.orm
        .select({ id: appUser.id })
        .from(appUser)
        .leftJoin(credential, eq(credential.userId, appUser.id))
        .where(
          and(
            eq(appUser.phoneE164, phone), isNull(appUser.deletedAt), eq(appUser.isStaff, false), eq(appUser.accountStatus, 'Active'),
            sql`(${credential.lockedUntil} is null or ${credential.lockedUntil} <= now())`,
          ),
        );
      if (user) {
        const otp = await this.support.createOtp(this.db, { phone, purpose: 'LOGIN_FALLBACK', userId: user.id, ip: input.ip });
        void this.support.sendCode(phone, otp.code).catch(() => undefined);
      }
    }
    return { accepted: true };
  }

  async verifyOtp(input: { challengeId: string; code: string; role?: 'DON' | 'PAT'; language?: 'bn' | 'en'; device?: DeviceInfo; ip?: string }) {
    const purpose = await this.support.purposeOf(this.db, input.challengeId);
    switch (purpose) {
      case 'REGISTRATION':
        return this.verifyRegistrationOtp(input);
      case 'PASSWORD_RESET':
        return this.verifyResetOtp(input);
      case 'LOGIN_FALLBACK':
        return this.verifyLoginOtp(input);
      default:
        throw new BadRequestException({ code: 'OTP_INVALID' });
    }
  }

  private async verifyRegistrationOtp(input: { challengeId: string; code: string; role?: 'DON' | 'PAT'; language?: 'bn' | 'en' }) {
    if (!input.role || !input.language) throw new BadRequestException({ code: 'ROLE_AND_LANGUAGE_REQUIRED' });
    const outcome = await this.db.transaction((tx) => this.support.consumeOtp(tx, input.challengeId, input.code, 'REGISTRATION'));
    if (!outcome.ok) throw new BadRequestException({ code: 'OTP_INVALID' });
    const setupToken = this.tokens.issue('setup', { phone: outcome.phone, role: input.role, lang: input.language, jti: input.challengeId }, SETUP_TTL_SECONDS);
    return { setupToken };
  }

  private async verifyResetOtp(input: { challengeId: string; code: string }) {
    return this.db.transaction(async (tx) => {
      const outcome = await this.support.consumeOtp(tx, input.challengeId, input.code, 'PASSWORD_RESET');
      if (!outcome.ok || !outcome.userId) throw new BadRequestException({ code: 'OTP_INVALID' });
      return this.passwordFlows.issueResetToken(tx, input.challengeId);
    });
  }

  private async verifyLoginOtp(input: { challengeId: string; code: string; role?: 'DON' | 'PAT'; device?: DeviceInfo; ip?: string }): Promise<TokenPair> {
    if (!input.device) throw new BadRequestException({ code: 'DEVICE_REQUIRED' });
    const info = input.device;
    const refresh = this.support.newRefreshToken();
    return this.db.transaction(async (tx) => {
      const outcome = await this.support.consumeOtp(tx, input.challengeId, input.code, 'LOGIN_FALLBACK');
      if (!outcome.ok || !outcome.userId) throw new BadRequestException({ code: 'OTP_INVALID' });
      const [user] = await tx.orm
        .select({ id: appUser.id, accountStatus: appUser.accountStatus, isStaff: appUser.isStaff })
        .from(appUser)
        .where(and(eq(appUser.id, outcome.userId), isNull(appUser.deletedAt)))
        .for('no key update');
      const lookup = sha256(outcome.phone);
      if (!user || user.isStaff || user.accountStatus !== 'Active') {
        await this.support.loginEvent(tx, { userId: outcome.userId, lookup, device: info, ip: input.ip, result: 'DENIED_POLICY', method: 'SMS_CODE' });
        throw fail(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE');
      }
      const roles = await this.support.activeRoles(tx, outcome.userId);
      const roleCode = input.role ?? roles[0];
      if (!roleCode || !roles.includes(roleCode)) throw fail(HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
      await this.support.markSignedIn(tx, outcome.userId);
      const opened = await this.support.openSession(tx, outcome.userId, roleCode, info, refresh, PUBLIC_REFRESH_DAYS);
      await this.afterSignIn(tx, outcome.userId, roleCode, lookup, info, input.ip, 'SMS_CODE', opened);
      return opened.pair;
    });
  }

  async setPassword(input: { setupToken: string; password: string; device: DeviceInfo; ip?: string }): Promise<TokenPair> {
    const claims = this.tokens.verify(input.setupToken, 'setup');
    if (!claims?.phone || !claims.role || !claims.jti) throw new UnauthorizedException({ code: 'SETUP_TOKEN_INVALID' });
    const problems = checkPassword(input.password, claims.phone);
    if (problems.length) throw new BadRequestException({ code: 'PASSWORD_REJECTED', problems });

    const hash = await this.passwords.hash(input.password);
    const refresh = this.support.newRefreshToken();
    const roleCode = claims.role as RoleCode;
    const phone = claims.phone;
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.orm.select({ id: appUser.id }).from(appUser).where(and(eq(appUser.phoneE164, phone), isNull(appUser.deletedAt)));
      if (existing) throw new ConflictException({ code: 'ACCOUNT_EXISTS' });

      const [user] = await tx.orm
        .insert(appUser)
        .values({ phoneE164: phone, phoneVerifiedAt: new Date(), preferredLanguage: claims.lang === 'en' ? 'en' : 'bn' })
        .returning({ id: appUser.id });
      const userId = user.id;
      const [roleRow] = await tx.orm.select({ id: role.id }).from(role).where(eq(role.code, roleCode));
      await tx.orm.insert(userRole).values({ userId, roleId: roleRow.id, status: 'Active', assignedAt: new Date() });
      await tx.orm.insert(credential).values({ userId, passwordHash: hash, hashAlgorithm: 'ARGON2ID', hashParams: HASH_PARAMS, passwordSetAt: new Date() });
      const opened = await this.support.openSession(tx, userId, roleCode, input.device, refresh, PUBLIC_REFRESH_DAYS);
      await this.support.loginEvent(tx, {
        userId, lookup: sha256(phone), device: input.device, ip: input.ip, result: 'SUCCESS', method: 'PASSWORD', sessionId: opened.sessionId, deviceId: opened.deviceId, isNewDevice: true,
      });
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'UserRegistered', payload: { role: roleCode } });
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'DeviceBound', payload: { deviceId: opened.deviceId, platform: input.device.platform } });
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId, actorRole: roleCode,
        entityType: 'app_user', entityId: userId, correlationId: randomUUID(),
      });
      return opened.pair;
    });
  }

  async login(input: { phone: string; password: string; device: DeviceInfo; role?: string; ip?: string; staffOnly?: boolean; mfaTrustDays?: number }): Promise<TokenPair | MfaChallenge> {
    if (await this.support.loginRateLimited(this.db, input.ip)) throw fail(HttpStatus.TOO_MANY_REQUESTS, 'LOGIN_RATE_LIMITED');
    const phone = normalizeBdPhone(input.phone);
    const lookup = sha256(phone ?? input.phone);
    const user = phone ? await this.credential(this.db, phone) : undefined;

    if (!user) {
      await this.passwords.verify(await this.getDummyHash(), input.password).catch(() => false);
      await this.support.loginEvent(this.db, { userId: null, lookup, device: input.device, ip: input.ip, result: 'FAILED_PASSWORD', method: 'PASSWORD' });
      await this.support.recordLoginFailure(this.db, null, 'UNKNOWN_NUMBER');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.support.loginEvent(this.db, { userId: user.id, lookup, device: input.device, ip: input.ip, result: 'LOCKED', method: 'PASSWORD' });
      await this.support.recordLoginFailure(this.db, user.id, 'LOCKED');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      await this.registerFailure(user, lookup, input);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    if (user.accountStatus !== 'Active') {
      await this.support.loginEvent(this.db, { userId: user.id, lookup, device: input.device, ip: input.ip, result: 'DENIED_POLICY', method: 'PASSWORD' });
      await this.support.recordLoginFailure(this.db, user.id, 'ACCOUNT_NOT_ACTIVE');
      throw fail(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE');
    }
    if (input.staffOnly && !user.isStaff) {
      await this.support.loginEvent(this.db, { userId: user.id, lookup, device: input.device, ip: input.ip, result: 'DENIED_POLICY', method: 'PASSWORD' });
      await this.support.recordLoginFailure(this.db, user.id, 'STAFF_ONLY');
      throw fail(HttpStatus.FORBIDDEN, 'STAFF_ONLY');
    }
    if (user.isStaff && !this.skipStaffSmsCode && !(await this.deviceIsMfaTrusted(user.id, input.device.installId, input.mfaTrustDays ?? STAFF_MFA_DAYS))) {
      return this.startStaffMfa(user.id, phone!, input.ip);
    }

    const refresh = this.support.newRefreshToken();
    return this.db.transaction(async (tx) => {
      const roles = await this.support.activeRoles(tx, user.id);
      const roleCode = (input.role ?? roles[0]) as RoleCode | undefined;
      if (!roleCode || !roles.includes(roleCode)) throw fail(HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
      await this.support.markSignedIn(tx, user.id);
      const opened = await this.support.openSession(tx, user.id, roleCode, input.device, refresh, user.isStaff ? STAFF_REFRESH_DAYS : PUBLIC_REFRESH_DAYS);
      await this.afterSignIn(tx, user.id, roleCode, lookup, input.device, input.ip, 'PASSWORD', opened);
      return opened.pair;
    });
  }

  async verifyStaffMfa(input: { challengeId: string; code: string; device: DeviceInfo; role?: string; ip?: string; trustDevice?: boolean }): Promise<TokenPair> {
    const outcome = await this.db.transaction((tx) => this.support.consumeOtp(tx, input.challengeId, input.code, 'STAFF_MFA'));
    if (!outcome.ok || !outcome.userId) throw new BadRequestException({ code: 'OTP_INVALID' });
    const userId = outcome.userId;

    const refresh = this.support.newRefreshToken();
    return this.db.transaction(async (tx) => {
      const roles = await this.support.activeRoles(tx, userId, true);
      const roleCode = (input.role ?? roles[0]) as RoleCode | undefined;
      if (!roleCode || !roles.includes(roleCode)) throw fail(HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
      const opened = await this.support.openSession(tx, userId, roleCode, input.device, refresh, STAFF_REFRESH_DAYS);
      await tx.orm
        .update(device)
        .set({ staffMfaVerifiedAt: input.trustDevice ?? true ? new Date() : null, updatedAt: new Date() })
        .where(eq(device.id, opened.deviceId));
      await this.support.markSignedIn(tx, userId);
      await this.afterSignIn(tx, userId, roleCode, sha256(outcome.phone), input.device, input.ip, 'STAFF_2STEP', opened);
      return opened.pair;
    });
  }

  async refresh(refreshToken: string, proof?: DeviceProof): Promise<TokenPair> {
    const hash = sha256(refreshToken);
    const result = await this.db.transaction(async (tx) => {
      const [current] = await tx.orm
        .select({
          id: session.id, userId: session.userId, deviceId: session.deviceId, activeRole: session.activeRole, expiresAt: session.expiresAt, stepUpAt: session.stepUpAt,
          revoked: sql<boolean>`${session.revokedAt} is not null`, expired: sql<boolean>`${session.expiresAt} <= now()`,
          superseded: exists(tx.orm.select({ one: sql`1` }).from(sql`idn.session c`).where(sql`c.rotated_from_id = ${session.id}`)),
          publicKey: device.publicKey, deviceStatus: device.signOutStatus, accountStatus: appUser.accountStatus, deleted: sql<boolean>`${appUser.deletedAt} is not null`,
        })
        .from(session)
        .innerJoin(device, eq(device.id, session.deviceId))
        .innerJoin(appUser, eq(appUser.id, session.userId))
        .where(eq(session.refreshTokenHash, hash))
        .for('no key update');
      if (!current || current.revoked || current.expired) return { ok: false as const, code: 'REFRESH_INVALID' };
      if (current.superseded) {
        await this.support.revokeSessions(tx, current.userId, 'ROTATION_REUSE', { userId: null, role: 'SYSTEM' }, { deviceId: current.deviceId });
        return { ok: false as const, code: 'REFRESH_INVALID' };
      }
      if (current.publicKey && !(proof && verifyDeviceProof(current.publicKey, 'refresh', refreshToken, proof))) {
        return { ok: false as const, code: 'DEVICE_PROOF_INVALID' };
      }
      if (current.accountStatus !== 'Active' || current.deleted) {
        await this.support.revokeSessions(tx, current.userId, 'ACCOUNT_SUSPENDED', { userId: null, role: 'SYSTEM' });
        return { ok: false as const, code: 'REFRESH_INVALID' };
      }
      if (current.deviceStatus !== 'Active') {
        await this.support.revokeSessions(tx, current.userId, 'DEVICE_REVOKED', { userId: null, role: 'SYSTEM' }, { deviceId: current.deviceId });
        return { ok: false as const, code: 'REFRESH_INVALID' };
      }
      const next = this.support.newRefreshToken();
      const [created] = await tx.orm
        .insert(session)
        .values({ userId: current.userId, deviceId: current.deviceId, refreshTokenHash: next.hash, rotatedFromId: current.id, activeRole: current.activeRole, expiresAt: current.expiresAt, stepUpAt: current.stepUpAt })
        .returning({ id: session.id });
      await tx.orm.update(device).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(device.id, current.deviceId));
      return { ok: true as const, pair: this.support.pair(current.userId, created.id, current.activeRole, next.token) };
    });
    if (!result.ok) throw new UnauthorizedException({ code: result.code });
    return result.pair;
  }

  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    const [row] = await this.db.orm
      .select({ id: session.id, userId: session.userId, activeRole: session.activeRole })
      .from(session)
      .where(and(eq(session.refreshTokenHash, sha256(refreshToken)), isNull(session.revokedAt)));
    if (row) await this.logout(row.id, row.userId, row.activeRole);
  }

  async logout(sessionId: string, userId: string, roleCode: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.orm
        .update(session)
        .set({ revokedAt: new Date(), revokeReason: 'LOGOUT', updatedAt: new Date() })
        .where(and(eq(session.id, sessionId), eq(session.userId, userId), isNull(session.revokedAt)));
      await this.audit.record(tx, {
        category: 'AUTH', action: 'LOGOUT', result: 'SUCCESS', actorUserId: userId,
        actorRole: roleCode as RoleCode, correlationId: randomUUID(),
      });
    });
  }

  async loadGrants(userId: string, roleCode: string): Promise<Grant[]> {
    const allowed = sql`${roleCode}::role_code = any (${permission.allowedRoles})`;
    const base = this.db.orm
      .select({ key: permission.key, scope: permissionSetItem.scope, requiresStepUp: permission.requiresStepUp, expiresAt: sql<Date | null>`null::timestamptz`.as('expires_at') })
      .from(permissionSet)
      .innerJoin(permissionSetItem, eq(permissionSetItem.permissionSetId, permissionSet.id))
      .innerJoin(permission, eq(permission.id, permissionSetItem.permissionId))
      .where(and(eq(permissionSet.kind, 'BASE'), eq(permissionSet.status, 'Active'), eq(permissionSet.roleCode, roleCode as RoleCode), allowed));
    const granted = this.db.orm
      .select({ key: permission.key, scope: permissionSetItem.scope, requiresStepUp: permission.requiresStepUp, expiresAt: sql<Date | null>`${userPermissionSet.expiresAt}`.as('expires_at') })
      .from(userPermissionSet)
      .innerJoin(permissionSet, and(eq(permissionSet.id, userPermissionSet.permissionSetId), eq(permissionSet.status, 'Active'), eq(permissionSet.roleCode, roleCode as RoleCode)))
      .innerJoin(permissionSetItem, eq(permissionSetItem.permissionSetId, permissionSet.id))
      .innerJoin(permission, eq(permission.id, permissionSetItem.permissionId))
      .where(
        and(
          eq(userPermissionSet.userId, userId), eq(userPermissionSet.status, 'Active'), sql`${userPermissionSet.effectiveFrom} <= now()`,
          sql`(${userPermissionSet.expiresAt} is null or ${userPermissionSet.expiresAt} > now())`, allowed,
        ),
      );
    const rows = await base.unionAll(granted);
    return rows.map((r) => ({ key: r.key, scope: r.scope as PermissionScope, expiresAt: r.expiresAt, requiresStepUp: r.requiresStepUp }));
  }

  async resolveSession(sessionId: string, userId: string, roleCode: string): Promise<SessionState | null> {
    const [row] = await this.db.orm
      .select({ stepUpAt: session.stepUpAt, deviceId: session.deviceId })
      .from(session)
      .innerJoin(appUser, eq(appUser.id, session.userId))
      .innerJoin(device, eq(device.id, session.deviceId))
      .where(
        and(
          eq(session.id, sessionId), eq(session.userId, userId), eq(session.activeRole, roleCode as RoleCode), isNull(session.revokedAt), gt(session.expiresAt, sql`now()`),
          eq(appUser.accountStatus, 'Active'), isNull(appUser.deletedAt), eq(device.signOutStatus, 'Active'),
        ),
      );
    return row ? { stepUpAt: row.stepUpAt, deviceId: row.deviceId } : null;
  }

  async sessionIsActive(sessionId: string, userId: string, roleCode: string): Promise<boolean> {
    return (await this.resolveSession(sessionId, userId, roleCode)) !== null;
  }

  private async credential(db: Db, phone: string): Promise<CredentialRow | undefined> {
    const [row] = await db.orm
      .select({
        id: appUser.id, accountStatus: appUser.accountStatus, isStaff: appUser.isStaff, passwordHash: credential.passwordHash,
        lockedUntil: credential.lockedUntil, failedAttempts: credential.failedAttempts, lockCount24h: credential.lockCount24h,
      })
      .from(appUser)
      .innerJoin(credential, eq(credential.userId, appUser.id))
      .where(and(eq(appUser.phoneE164, phone), isNull(appUser.deletedAt)));
    return row;
  }

  private async registerFailure(user: CredentialRow, lookup: string, input: { device: DeviceInfo; ip?: string }) {
    const failures = user.failedAttempts + 1;
    const lock = failures >= LOCK_AFTER_FAILURES;
    const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** user.lockCount24h, LOCK_MAX_MINUTES);
    await this.db.transaction(async (tx) => {
      await tx.orm
        .update(credential)
        .set({
          failedAttempts: lock ? 0 : failures,
          lockCount24h: lock ? sql`${credential.lockCount24h} + 1` : credential.lockCount24h,
          lockedUntil: lock ? minutesFromNow(minutes) : credential.lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(credential.userId, user.id));
      await this.support.loginEvent(tx, {
        userId: user.id, lookup, device: input.device, ip: input.ip, result: 'FAILED_PASSWORD', method: 'PASSWORD', riskFlags: lock ? ['MANY_FAILURES'] : [],
      });
      await this.support.recordLoginFailure(tx, user.id, 'WRONG_PASSWORD');
      if (lock) {
        const roleCode = (await this.support.activeRoles(tx, user.id))[0] ?? 'DON';
        await this.audit.record(tx, {
          category: 'AUTH', action: 'ACCOUNT_LOCKED', result: 'SUCCESS', actorUserId: null, actorRole: 'SYSTEM', subjectUserId: user.id,
          reasonCode: 'MANY_FAILURES', changes: { minutes }, correlationId: randomUUID(),
        });
        await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: user.id, eventType: 'AccountLocked', payload: { minutes } });
        await this.support.securityAlert(tx, user.id, roleCode, 'ACCOUNT_LOCKED', { minutes });
      }
    });
  }

  private async afterSignIn(
    tx: Db, userId: string, roleCode: RoleCode, lookup: string, info: DeviceInfo, ip: string | undefined,
    method: 'PASSWORD' | 'SMS_CODE' | 'STAFF_2STEP', opened: { sessionId: string; deviceId: string; isNewDevice: boolean },
  ) {
    await this.support.loginEvent(tx, {
      userId, lookup, device: info, ip, result: 'SUCCESS', method, sessionId: opened.sessionId, deviceId: opened.deviceId,
      isNewDevice: opened.isNewDevice, riskFlags: opened.isNewDevice ? ['NEW_DEVICE'] : [],
    });
    await this.support.recordLoginSuccess(tx, userId, roleCode);
    if (opened.isNewDevice) {
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'SignedInNewDevice', payload: { deviceId: opened.deviceId, platform: info.platform } });
      await this.support.securityAlert(tx, userId, roleCode, 'NEW_DEVICE', { deviceModel: info.model, platform: info.platform });
    }
  }

  private async deviceIsMfaTrusted(userId: string, installId: string, days: number): Promise<boolean> {
    if (days <= 0) return false;
    const [row] = await this.db.orm
      .select({ id: device.id })
      .from(device)
      .where(
        and(
          eq(device.userId, userId), eq(device.installId, installId), eq(device.signOutStatus, 'Active'),
          gt(device.staffMfaVerifiedAt, sql`now() - make_interval(days => ${days}::int)`),
        ),
      );
    return row !== undefined;
  }

  private async startStaffMfa(userId: string, phone: string, ip?: string): Promise<MfaChallenge> {
    const { challengeId, expiresInSeconds } = await this.support.issueOtp(this.db, { phone, purpose: 'STAFF_MFA', userId, ip });
    return { mfaRequired: true, challengeId, expiresInSeconds };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomUUID());
    return this.dummyHash;
  }
}
