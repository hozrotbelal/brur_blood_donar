import { BadRequestException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, isNull, notExists, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal, RoleCode, STEP_UP_WINDOW_MS } from '../../platform/policy/policy.types';
import { DeviceProof, verifyDeviceProof } from '../../platform/security/device-proof';
import { AuthSupport, fail } from './auth.support';
import { appUser, device, loginEvent, session } from './schema';

export interface SessionView {
  sessionId: string;
  deviceId: string;
  role: string;
  platform: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly support: AuthSupport,
  ) {}

  async list(principal: Principal): Promise<{ sessions: SessionView[] }> {
    const rotated = this.db.orm.$with('rotated').as(this.db.orm.select({ id: session.rotatedFromId }).from(session));
    const sessions = await this.db.orm
      .with(rotated)
      .select({
        sessionId: session.id, deviceId: device.id, role: session.activeRole, platform: device.platform, deviceModel: device.deviceModel, osVersion: device.osVersion,
        appVersion: device.appVersion, firstSeenAt: device.firstSeenAt, lastSeenAt: device.lastSeenAt, createdAt: session.createdAt, expiresAt: session.expiresAt,
        current: sql<boolean>`(${session.id} = ${principal.sessionId ?? null}::uuid)`,
      })
      .from(session)
      .innerJoin(device, eq(device.id, session.deviceId))
      .where(
        and(
          eq(session.userId, principal.userId), isNull(session.revokedAt), gt(session.expiresAt, sql`now()`), eq(device.signOutStatus, 'Active'),
          notExists(this.db.orm.select({ one: sql`1` }).from(rotated).where(eq(rotated.id, session.id))),
        ),
      )
      .orderBy(desc(device.lastSeenAt));
    return { sessions };
  }

  async signOutDevice(principal: Principal, deviceId: string): Promise<{ revoked: number }> {
    return this.db.transaction(async (tx) => {
      const [owned] = await tx.orm.select({ id: device.id }).from(device).where(and(eq(device.id, deviceId), eq(device.userId, principal.userId))).for('no key update');
      if (!owned) throw new NotFoundException({ code: 'DEVICE_NOT_FOUND' });
      const revoked = await this.support.revokeSessions(tx, principal.userId, 'DEVICE_REVOKED', { userId: principal.userId, role: principal.role }, { deviceId });
      await tx.orm.update(device).set({ signOutStatus: 'Signed out', signedOutAt: new Date(), staffMfaVerifiedAt: null, updatedAt: new Date() }).where(eq(device.id, deviceId));
      await this.audit.record(tx, {
        category: 'AUTH', action: 'DEVICE_SIGNED_OUT', result: 'SUCCESS', actorUserId: principal.userId, actorRole: principal.role,
        entityType: 'device', entityId: deviceId, correlationId: randomUUID(),
      });
      return { revoked };
    });
  }

  async signOutOthers(principal: Principal): Promise<{ revoked: number }> {
    return this.db.transaction(async (tx) => ({
      revoked: await this.support.revokeSessions(tx, principal.userId, 'LOGOUT', { userId: principal.userId, role: principal.role }, { exceptSessionId: principal.sessionId }),
    }));
  }

  async loginActivity(principal: Principal, limit = 50) {
    const events = await this.db.orm
      .select({
        id: loginEvent.id, occurredAt: loginEvent.occurredAt, method: loginEvent.method, result: loginEvent.result, deviceModel: loginEvent.deviceModel,
        osVersion: loginEvent.osVersion, appVersion: loginEvent.appVersion, isNewDevice: loginEvent.isNewDevice, riskFlags: loginEvent.riskFlags, locationSource: loginEvent.locationSource,
      })
      .from(loginEvent)
      .where(eq(loginEvent.userId, principal.userId))
      .orderBy(desc(loginEvent.occurredAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    return { events };
  }

  async reportSuspicious(principal: Principal, loginEventId: string): Promise<{ revoked: number; nextStep: 'RESET_PASSWORD' }> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx.orm.select({ deviceId: loginEvent.deviceId }).from(loginEvent).where(and(eq(loginEvent.id, loginEventId), eq(loginEvent.userId, principal.userId)));
      if (!event) throw new NotFoundException({ code: 'LOGIN_EVENT_NOT_FOUND' });
      const revoked = await this.support.revokeSessions(tx, principal.userId, 'DEVICE_REVOKED', { userId: principal.userId, role: principal.role }, { exceptSessionId: principal.sessionId });
      if (event.deviceId) {
        await tx.orm
          .update(device)
          .set({ signOutStatus: 'Revoked', revokedAt: new Date(), staffMfaVerifiedAt: null, updatedAt: new Date() })
          .where(and(eq(device.id, event.deviceId), eq(device.userId, principal.userId)));
      }
      await this.audit.record(tx, {
        category: 'AUTH', action: 'SUSPICIOUS_SIGN_IN_REPORTED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: principal.role,
        entityType: 'login_event', entityId: loginEventId, correlationId: randomUUID(),
      });
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: principal.userId, eventType: 'SuspiciousSignInReported', payload: { loginEventId, role: principal.role } });
      await this.support.securityAlert(tx, principal.userId, principal.role as RoleCode, 'SUSPICIOUS_SIGN_IN_REPORTED');
      return { revoked, nextStep: 'RESET_PASSWORD' };
    });
  }

  async stepUpChallenge(principal: Principal, ip?: string) {
    const [user] = await this.db.orm.select({ phone: appUser.phoneE164 }).from(appUser).where(and(eq(appUser.id, principal.userId), isNull(appUser.deletedAt)));
    if (!user) throw fail(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
    return this.support.issueOtp(this.db, { phone: user.phone, purpose: 'STEP_UP', userId: principal.userId, ip });
  }

  async stepUp(principal: Principal, input: { challengeId?: string; code?: string; proof?: DeviceProof }): Promise<{ stepUpValidUntil: Date }> {
    if (!principal.sessionId) throw fail(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
    const sessionId = principal.sessionId;
    return this.db.transaction(async (tx) => {
      let method: 'DEVICE_KEY' | 'SMS_CODE';
      if (input.proof) {
        const [key] = await tx.orm
          .select({ publicKey: device.publicKey })
          .from(session)
          .innerJoin(device, eq(device.id, session.deviceId))
          .where(and(eq(session.id, sessionId), eq(session.userId, principal.userId)));
        if (!key?.publicKey || !verifyDeviceProof(key.publicKey, 'step-up', sessionId, input.proof)) throw fail(HttpStatus.UNAUTHORIZED, 'DEVICE_PROOF_INVALID');
        method = 'DEVICE_KEY';
      } else if (input.challengeId && input.code) {
        const outcome = await this.support.consumeOtp(tx, input.challengeId, input.code, 'STEP_UP');
        if (!outcome.ok || outcome.userId !== principal.userId) throw new BadRequestException({ code: 'OTP_INVALID' });
        method = 'SMS_CODE';
      } else {
        throw new BadRequestException({ code: 'STEP_UP_PROOF_REQUIRED' });
      }
      const [updated] = await tx.orm
        .update(session)
        .set({ stepUpAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(session.id, sessionId), eq(session.userId, principal.userId), isNull(session.revokedAt)))
        .returning({ stepUpAt: session.stepUpAt });
      if (!updated?.stepUpAt) throw fail(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
      await this.audit.record(tx, {
        category: 'AUTH', action: 'STEP_UP', result: 'SUCCESS', actorUserId: principal.userId, actorRole: principal.role, reasonCode: method, correlationId: randomUUID(),
      });
      return { stepUpValidUntil: new Date(updated.stepUpAt.getTime() + STEP_UP_WINDOW_MS) };
    });
  }
}
