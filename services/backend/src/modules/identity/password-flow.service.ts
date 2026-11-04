import { BadRequestException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { Db, DatabaseService } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal, RoleCode } from '../../platform/policy/policy.types';
import { AuthSupport, DeviceInfo, PUBLIC_REFRESH_DAYS, RESET_TOKEN_TTL_MINUTES, STAFF_PASSWORD_HISTORY, TokenPair, fail, minutesFromNow, sha256 } from './auth.support';
import { PasswordService } from './password.service';
import { checkPassword } from './password-policy';
import { normalizeBdPhone } from './phone';
import { appUser, credential, device, passwordHistory, passwordReset } from './schema';

interface AccountRow {
  id: string;
  phone: string;
  isStaff: boolean;
  accountStatus: string;
  passwordHash: string;
}

const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordFlowService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly support: AuthSupport,
  ) {}

  async forgot(input: { phone: string; ip?: string }): Promise<{ accepted: true }> {
    const phone = normalizeBdPhone(input.phone);
    if (!phone || !(await this.support.otpAllowed(this.db, phone, 'PASSWORD_RESET', input.ip))) return { accepted: true };
    const [user] = await this.db.orm
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.phoneE164, phone), isNull(appUser.deletedAt), inArray(appUser.accountStatus, ['Active', 'Locked'])));
    if (!user) return { accepted: true };
    const code = await this.db.transaction(async (tx) => {
      const otp = await this.support.createOtp(tx, { phone, purpose: 'PASSWORD_RESET', userId: user.id, ip: input.ip });
      await tx.orm.insert(passwordReset).values({
        userId: user.id, otpChallengeId: otp.challengeId, status: 'Requested', requestedAt: new Date(),
        expiresAt: new Date(Date.now() + otp.expiresInSeconds * 1000), ipHash: input.ip ? sha256(input.ip) : null,
      });
      await this.audit.record(tx, {
        category: 'AUTH', action: 'PASSWORD_RESET_REQUESTED', result: 'SUCCESS', actorUserId: null, actorRole: 'SYSTEM', subjectUserId: user.id, correlationId: randomUUID(),
      });
      return otp.code;
    });
    void this.support.sendCode(phone, code).catch(() => undefined);
    return { accepted: true };
  }

  async issueResetToken(tx: Db, challengeId: string): Promise<{ resetToken: string; expiresInSeconds: number }> {
    const token = randomBytes(32).toString('base64url');
    const res = await tx.orm
      .update(passwordReset)
      .set({ status: 'Verified', resetTokenHash: sha256(token), expiresAt: minutesFromNow(RESET_TOKEN_TTL_MINUTES), version: sql`${passwordReset.version} + 1`, updatedAt: new Date() })
      .where(and(eq(passwordReset.otpChallengeId, challengeId), eq(passwordReset.status, 'Requested')));
    if (!res.rowCount) throw new BadRequestException({ code: 'OTP_INVALID' });
    return { resetToken: token, expiresInSeconds: RESET_TOKEN_TTL_MINUTES * 60 };
  }

  async reset(input: { resetToken: string; password: string; device: DeviceInfo; ip?: string }): Promise<{ signedIn: boolean; tokens?: TokenPair }> {
    return this.db.transaction(async (tx) => {
      const [reset] = await tx.orm
        .select({ id: passwordReset.id, userId: passwordReset.userId, status: passwordReset.status, expired: sql<boolean>`${passwordReset.expiresAt} <= now()` })
        .from(passwordReset)
        .where(eq(passwordReset.resetTokenHash, sha256(input.resetToken)))
        .for('update');
      if (!reset || reset.status !== 'Verified' || reset.expired) {
        if (reset && reset.status === 'Verified' && reset.expired) {
          await tx.orm.update(passwordReset).set({ status: 'Expired', version: sql`${passwordReset.version} + 1`, updatedAt: new Date() }).where(eq(passwordReset.id, reset.id));
        }
        throw fail(HttpStatus.GONE, 'RESET_TOKEN_INVALID');
      }
      const account = await this.account(tx, reset.userId);
      if (!account || !['Active', 'Locked'].includes(account.accountStatus)) throw fail(HttpStatus.GONE, 'RESET_TOKEN_INVALID');
      const roleCode = (await this.support.activeRoles(tx, account.id))[0] ?? 'DON';

      await this.storeNewPassword(tx, account, input.password, true);
      await tx.orm.update(passwordReset).set({ status: 'Completed', completedAt: new Date(), version: sql`${passwordReset.version} + 1`, updatedAt: new Date() }).where(eq(passwordReset.id, reset.id));
      await this.support.revokeSessions(tx, account.id, 'PASSWORD_RESET', { userId: account.id, role: roleCode });
      await tx.orm.update(device).set({ staffMfaVerifiedAt: null, updatedAt: new Date() }).where(eq(device.userId, account.id));
      await this.audit.record(tx, {
        category: 'AUTH', action: 'PASSWORD_RESET_COMPLETED', result: 'SUCCESS', actorUserId: account.id, actorRole: roleCode, entityType: 'credential', entityId: account.id,
        correlationId: randomUUID(),
      });
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: account.id, eventType: 'PasswordReset', payload: { role: roleCode, isStaff: account.isStaff } });
      await this.support.securityAlert(tx, account.id, roleCode, 'PASSWORD_RESET');

      if (account.isStaff) return { signedIn: false };
      const opened = await this.support.openSession(tx, account.id, roleCode, input.device, this.support.newRefreshToken(), PUBLIC_REFRESH_DAYS);
      await this.support.loginEvent(tx, {
        userId: account.id, lookup: sha256(account.phone), device: input.device, ip: input.ip, result: 'SUCCESS', method: 'PASSWORD',
        sessionId: opened.sessionId, deviceId: opened.deviceId, isNewDevice: opened.isNewDevice, riskFlags: opened.isNewDevice ? ['NEW_DEVICE'] : [],
      });
      await this.support.recordLoginSuccess(tx, account.id, roleCode);
      return { signedIn: true, tokens: opened.pair };
    });
  }

  async change(principal: Principal, input: { currentPassword: string; newPassword: string; signOutOtherDevices?: boolean }): Promise<{ otherSessionsRevoked: number }> {
    return this.db.transaction(async (tx) => {
      const account = await this.account(tx, principal.userId);
      if (!account) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
      const valid = await this.passwords.verify(account.passwordHash, input.currentPassword).catch(() => false);
      if (!valid) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
      await this.storeNewPassword(tx, account, input.newPassword, false);
      const revoked = input.signOutOtherDevices === false
        ? 0
        : await this.support.revokeSessions(tx, account.id, 'PASSWORD_CHANGED', { userId: account.id, role: principal.role }, { exceptSessionId: principal.sessionId });
      await this.audit.record(tx, {
        category: 'AUTH', action: 'PASSWORD_CHANGED', result: 'SUCCESS', actorUserId: account.id, actorRole: principal.role, entityType: 'credential', entityId: account.id,
        correlationId: randomUUID(),
      });
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: account.id, eventType: 'PasswordChanged', payload: { role: principal.role } });
      await this.support.securityAlert(tx, account.id, principal.role as RoleCode, 'PASSWORD_CHANGED');
      return { otherSessionsRevoked: revoked };
    });
  }

  private async account(db: Db, userId: string): Promise<AccountRow | undefined> {
    const [row] = await db.orm
      .select({ id: appUser.id, phone: appUser.phoneE164, isStaff: appUser.isStaff, accountStatus: appUser.accountStatus, passwordHash: credential.passwordHash })
      .from(appUser)
      .innerJoin(credential, eq(credential.userId, appUser.id))
      .where(and(eq(appUser.id, userId), isNull(appUser.deletedAt)))
      .for('no key update');
    return row;
  }

  private async storeNewPassword(tx: Db, account: AccountRow, password: string, clearLock: boolean): Promise<void> {
    const problems = checkPassword(password, account.phone, account.isStaff);
    if (problems.length) throw new BadRequestException({ code: 'PASSWORD_REJECTED', problems });
    if (account.isStaff) await this.assertNotReused(tx, account, password);
    const hash = await this.passwords.hash(password);
    if (account.isStaff) await tx.orm.insert(passwordHistory).values({ userId: account.id, passwordHash: account.passwordHash });
    await tx.orm
      .update(credential)
      .set({
        passwordHash: hash, hashAlgorithm: 'ARGON2ID', hashParams: HASH_PARAMS, passwordSetAt: new Date(), mustChange: false,
        ...(clearLock ? { failedAttempts: 0, lockedUntil: null, lockCount24h: 0 } : {}),
        version: sql`${credential.version} + 1`, updatedAt: new Date(),
      })
      .where(eq(credential.userId, account.id));
    if (clearLock) await tx.orm.update(appUser).set({ accountStatus: 'Active', updatedAt: new Date() }).where(and(eq(appUser.id, account.id), eq(appUser.accountStatus, 'Locked')));
  }

  private async assertNotReused(tx: Db, account: AccountRow, password: string): Promise<void> {
    const rows = await tx.orm
      .select({ hash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, account.id))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(STAFF_PASSWORD_HISTORY - 1);
    for (const hash of [account.passwordHash, ...rows.map((r) => r.hash)]) {
      if (await this.passwords.verify(hash, password).catch(() => false)) throw new BadRequestException({ code: 'PASSWORD_REJECTED', problems: ['REUSED'] });
    }
  }
}
