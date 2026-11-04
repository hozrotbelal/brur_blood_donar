"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const policy_types_1 = require("../../platform/policy/policy.types");
const device_proof_1 = require("../../platform/security/device-proof");
const auth_support_1 = require("./auth.support");
const schema_1 = require("./schema");
let SessionService = class SessionService {
    db;
    outbox;
    audit;
    support;
    constructor(db, outbox, audit, support) {
        this.db = db;
        this.outbox = outbox;
        this.audit = audit;
        this.support = support;
    }
    async list(principal) {
        const rotated = this.db.orm.$with('rotated').as(this.db.orm.select({ id: schema_1.session.rotatedFromId }).from(schema_1.session));
        const sessions = await this.db.orm
            .with(rotated)
            .select({
            sessionId: schema_1.session.id, deviceId: schema_1.device.id, role: schema_1.session.activeRole, platform: schema_1.device.platform, deviceModel: schema_1.device.deviceModel, osVersion: schema_1.device.osVersion,
            appVersion: schema_1.device.appVersion, firstSeenAt: schema_1.device.firstSeenAt, lastSeenAt: schema_1.device.lastSeenAt, createdAt: schema_1.session.createdAt, expiresAt: schema_1.session.expiresAt,
            current: (0, drizzle_orm_1.sql) `(${schema_1.session.id} = ${principal.sessionId ?? null}::uuid)`,
        })
            .from(schema_1.session)
            .innerJoin(schema_1.device, (0, drizzle_orm_1.eq)(schema_1.device.id, schema_1.session.deviceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.userId, principal.userId), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt), (0, drizzle_orm_1.gt)(schema_1.session.expiresAt, (0, drizzle_orm_1.sql) `now()`), (0, drizzle_orm_1.eq)(schema_1.device.signOutStatus, 'Active'), (0, drizzle_orm_1.notExists)(this.db.orm.select({ one: (0, drizzle_orm_1.sql) `1` }).from(rotated).where((0, drizzle_orm_1.eq)(rotated.id, schema_1.session.id)))))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.device.lastSeenAt));
        return { sessions };
    }
    async signOutDevice(principal, deviceId) {
        return this.db.transaction(async (tx) => {
            const [owned] = await tx.orm.select({ id: schema_1.device.id }).from(schema_1.device).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.device.id, deviceId), (0, drizzle_orm_1.eq)(schema_1.device.userId, principal.userId))).for('no key update');
            if (!owned)
                throw new common_1.NotFoundException({ code: 'DEVICE_NOT_FOUND' });
            const revoked = await this.support.revokeSessions(tx, principal.userId, 'DEVICE_REVOKED', { userId: principal.userId, role: principal.role }, { deviceId });
            await tx.orm.update(schema_1.device).set({ signOutStatus: 'Signed out', signedOutAt: new Date(), staffMfaVerifiedAt: null, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.device.id, deviceId));
            await this.audit.record(tx, {
                category: 'AUTH', action: 'DEVICE_SIGNED_OUT', result: 'SUCCESS', actorUserId: principal.userId, actorRole: principal.role,
                entityType: 'device', entityId: deviceId, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { revoked };
        });
    }
    async signOutOthers(principal) {
        return this.db.transaction(async (tx) => ({
            revoked: await this.support.revokeSessions(tx, principal.userId, 'LOGOUT', { userId: principal.userId, role: principal.role }, { exceptSessionId: principal.sessionId }),
        }));
    }
    async loginActivity(principal, limit = 50) {
        const events = await this.db.orm
            .select({
            id: schema_1.loginEvent.id, occurredAt: schema_1.loginEvent.occurredAt, method: schema_1.loginEvent.method, result: schema_1.loginEvent.result, deviceModel: schema_1.loginEvent.deviceModel,
            osVersion: schema_1.loginEvent.osVersion, appVersion: schema_1.loginEvent.appVersion, isNewDevice: schema_1.loginEvent.isNewDevice, riskFlags: schema_1.loginEvent.riskFlags, locationSource: schema_1.loginEvent.locationSource,
        })
            .from(schema_1.loginEvent)
            .where((0, drizzle_orm_1.eq)(schema_1.loginEvent.userId, principal.userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.loginEvent.occurredAt))
            .limit(Math.min(Math.max(limit, 1), 200));
        return { events };
    }
    async reportSuspicious(principal, loginEventId) {
        return this.db.transaction(async (tx) => {
            const [event] = await tx.orm.select({ deviceId: schema_1.loginEvent.deviceId }).from(schema_1.loginEvent).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.loginEvent.id, loginEventId), (0, drizzle_orm_1.eq)(schema_1.loginEvent.userId, principal.userId)));
            if (!event)
                throw new common_1.NotFoundException({ code: 'LOGIN_EVENT_NOT_FOUND' });
            const revoked = await this.support.revokeSessions(tx, principal.userId, 'DEVICE_REVOKED', { userId: principal.userId, role: principal.role }, { exceptSessionId: principal.sessionId });
            if (event.deviceId) {
                await tx.orm
                    .update(schema_1.device)
                    .set({ signOutStatus: 'Revoked', revokedAt: new Date(), staffMfaVerifiedAt: null, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.device.id, event.deviceId), (0, drizzle_orm_1.eq)(schema_1.device.userId, principal.userId)));
            }
            await this.audit.record(tx, {
                category: 'AUTH', action: 'SUSPICIOUS_SIGN_IN_REPORTED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: principal.role,
                entityType: 'login_event', entityId: loginEventId, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: principal.userId, eventType: 'SuspiciousSignInReported', payload: { loginEventId, role: principal.role } });
            await this.support.securityAlert(tx, principal.userId, principal.role, 'SUSPICIOUS_SIGN_IN_REPORTED');
            return { revoked, nextStep: 'RESET_PASSWORD' };
        });
    }
    async stepUpChallenge(principal, ip) {
        const [user] = await this.db.orm.select({ phone: schema_1.appUser.phoneE164 }).from(schema_1.appUser).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, principal.userId), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)));
        if (!user)
            throw (0, auth_support_1.fail)(common_1.HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
        return this.support.issueOtp(this.db, { phone: user.phone, purpose: 'STEP_UP', userId: principal.userId, ip });
    }
    async stepUp(principal, input) {
        if (!principal.sessionId)
            throw (0, auth_support_1.fail)(common_1.HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
        const sessionId = principal.sessionId;
        return this.db.transaction(async (tx) => {
            let method;
            if (input.proof) {
                const [key] = await tx.orm
                    .select({ publicKey: schema_1.device.publicKey })
                    .from(schema_1.session)
                    .innerJoin(schema_1.device, (0, drizzle_orm_1.eq)(schema_1.device.id, schema_1.session.deviceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.id, sessionId), (0, drizzle_orm_1.eq)(schema_1.session.userId, principal.userId)));
                if (!key?.publicKey || !(0, device_proof_1.verifyDeviceProof)(key.publicKey, 'step-up', sessionId, input.proof))
                    throw (0, auth_support_1.fail)(common_1.HttpStatus.UNAUTHORIZED, 'DEVICE_PROOF_INVALID');
                method = 'DEVICE_KEY';
            }
            else if (input.challengeId && input.code) {
                const outcome = await this.support.consumeOtp(tx, input.challengeId, input.code, 'STEP_UP');
                if (!outcome.ok || outcome.userId !== principal.userId)
                    throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
                method = 'SMS_CODE';
            }
            else {
                throw new common_1.BadRequestException({ code: 'STEP_UP_PROOF_REQUIRED' });
            }
            const [updated] = await tx.orm
                .update(schema_1.session)
                .set({ stepUpAt: (0, drizzle_orm_1.sql) `now()`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.id, sessionId), (0, drizzle_orm_1.eq)(schema_1.session.userId, principal.userId), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt)))
                .returning({ stepUpAt: schema_1.session.stepUpAt });
            if (!updated?.stepUpAt)
                throw (0, auth_support_1.fail)(common_1.HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
            await this.audit.record(tx, {
                category: 'AUTH', action: 'STEP_UP', result: 'SUCCESS', actorUserId: principal.userId, actorRole: principal.role, reasonCode: method, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { stepUpValidUntil: new Date(updated.stepUpAt.getTime() + policy_types_1.STEP_UP_WINDOW_MS) };
        });
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService,
        auth_support_1.AuthSupport])
], SessionService);
//# sourceMappingURL=session.service.js.map