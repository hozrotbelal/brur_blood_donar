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
exports.AuthSupport = exports.minutesFromNow = exports.fail = exports.sha256 = exports.STAFF_PASSWORD_HISTORY = exports.LOGIN_FAILURES_PER_IP_PER_15_MIN = exports.OTP_REQUESTS_PER_IP_PER_DAY = exports.OTP_REQUESTS_PER_DAY = exports.LOCK_MAX_MINUTES = exports.LOCK_BASE_MINUTES = exports.LOCK_AFTER_FAILURES = exports.STAFF_MFA_DAYS = exports.STAFF_REFRESH_DAYS = exports.PUBLIC_REFRESH_DAYS = exports.RESET_TOKEN_TTL_MINUTES = exports.SETUP_TTL_SECONDS = exports.ACCESS_TTL_SECONDS = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const device_proof_1 = require("../../platform/security/device-proof");
const token_service_1 = require("../../platform/security/token.service");
const otp_1 = require("./otp");
const schema_1 = require("./schema");
const sms_port_1 = require("./sms.port");
exports.ACCESS_TTL_SECONDS = 900;
exports.SETUP_TTL_SECONDS = 900;
exports.RESET_TOKEN_TTL_MINUTES = 10;
exports.PUBLIC_REFRESH_DAYS = 30;
exports.STAFF_REFRESH_DAYS = 7;
exports.STAFF_MFA_DAYS = 30;
exports.LOCK_AFTER_FAILURES = 5;
exports.LOCK_BASE_MINUTES = 15;
exports.LOCK_MAX_MINUTES = 1440;
exports.OTP_REQUESTS_PER_DAY = 10;
exports.OTP_REQUESTS_PER_IP_PER_DAY = 20;
exports.LOGIN_FAILURES_PER_IP_PER_15_MIN = 20;
exports.STAFF_PASSWORD_HISTORY = 5;
const sha256 = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
exports.sha256 = sha256;
const fail = (status, code) => new common_1.HttpException({ code }, status);
exports.fail = fail;
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60_000);
exports.minutesFromNow = minutesFromNow;
let AuthSupport = class AuthSupport {
    db;
    tokens;
    sms;
    outbox;
    audit;
    constructor(db, tokens, sms, outbox, audit) {
        this.db = db;
        this.tokens = tokens;
        this.sms = sms;
        this.outbox = outbox;
        this.audit = audit;
    }
    async otpAllowed(db, phone, purpose, ip) {
        const ipFilter = ip ? (0, drizzle_orm_1.sql) `${schema_1.otpChallenge.requestIp} = ${ip}::inet` : (0, drizzle_orm_1.sql) `false`;
        const [r] = await db.orm
            .select({
            recent: (0, drizzle_orm_1.sql) `count(*) filter (where ${schema_1.otpChallenge.phoneE164} = ${phone} and ${schema_1.otpChallenge.purpose} = ${purpose}::otp_purpose and ${schema_1.otpChallenge.createdAt} > now() - interval '15 minutes')`.mapWith(Number),
            day: (0, drizzle_orm_1.sql) `count(*) filter (where ${schema_1.otpChallenge.phoneE164} = ${phone})`.mapWith(Number),
            ipDay: (0, drizzle_orm_1.sql) `count(*) filter (where ${ipFilter})`.mapWith(Number),
        })
            .from(schema_1.otpChallenge)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gt)(schema_1.otpChallenge.createdAt, (0, drizzle_orm_1.sql) `now() - interval '24 hours'`), (0, drizzle_orm_1.sql) `(${schema_1.otpChallenge.phoneE164} = ${phone} or ${ipFilter})`));
        return r.recent < otp_1.OTP_REQUESTS_PER_15_MIN && r.day < exports.OTP_REQUESTS_PER_DAY && r.ipDay < exports.OTP_REQUESTS_PER_IP_PER_DAY;
    }
    async createOtp(db, input) {
        const challengeId = (0, node_crypto_1.randomUUID)();
        const code = (0, otp_1.generateOtp)();
        await db.orm.insert(schema_1.otpChallenge).values({
            id: challengeId, phoneE164: input.phone, userId: input.userId ?? null, purpose: input.purpose, codeHash: (0, otp_1.hashOtp)(challengeId, code),
            expiresAt: new Date(Date.now() + otp_1.OTP_TTL_SECONDS * 1000), requestIp: input.ip ?? null,
        });
        return { challengeId, code, expiresInSeconds: otp_1.OTP_TTL_SECONDS };
    }
    async issueOtp(db, input) {
        if (!(await this.otpAllowed(db, input.phone, input.purpose, input.ip)))
            throw (0, exports.fail)(common_1.HttpStatus.TOO_MANY_REQUESTS, 'OTP_RATE_LIMITED');
        const otp = await this.createOtp(db, input);
        await this.sendCode(input.phone, otp.code);
        return { challengeId: otp.challengeId, expiresInSeconds: otp.expiresInSeconds };
    }
    sendCode(phone, code) {
        return this.sms.send(phone, `BBDA code: ${code}. It expires in ${otp_1.OTP_TTL_SECONDS / 60} minutes. Never share it.`);
    }
    async purposeOf(db, challengeId) {
        const [row] = await db.orm.select({ purpose: schema_1.otpChallenge.purpose }).from(schema_1.otpChallenge).where((0, drizzle_orm_1.eq)(schema_1.otpChallenge.id, challengeId));
        return row?.purpose ?? null;
    }
    async consumeOtp(tx, challengeId, code, purpose) {
        const [row] = await tx.orm
            .select({ phone: schema_1.otpChallenge.phoneE164, userId: schema_1.otpChallenge.userId, codeHash: schema_1.otpChallenge.codeHash, attempts: schema_1.otpChallenge.attempts, consumedAt: schema_1.otpChallenge.consumedAt, expired: (0, drizzle_orm_1.sql) `${schema_1.otpChallenge.expiresAt} <= now()` })
            .from(schema_1.otpChallenge)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.otpChallenge.id, challengeId), (0, drizzle_orm_1.eq)(schema_1.otpChallenge.purpose, purpose)))
            .for('no key update');
        if (!row || row.consumedAt || row.expired || row.attempts >= otp_1.OTP_MAX_ATTEMPTS)
            return { ok: false };
        if (!(0, otp_1.otpMatches)(challengeId, code, row.codeHash)) {
            await tx.orm.update(schema_1.otpChallenge).set({ attempts: (0, drizzle_orm_1.sql) `${schema_1.otpChallenge.attempts} + 1` }).where((0, drizzle_orm_1.eq)(schema_1.otpChallenge.id, challengeId));
            return { ok: false };
        }
        await tx.orm.update(schema_1.otpChallenge).set({ consumedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.otpChallenge.id, challengeId));
        return { ok: true, phone: row.phone, userId: row.userId };
    }
    newRefreshToken() {
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        return { token, hash: (0, exports.sha256)(token) };
    }
    pair(userId, sessionId, roleCode, refreshToken) {
        return {
            accessToken: this.tokens.issue('access', { sub: userId, sid: sessionId, role: roleCode }, exports.ACCESS_TTL_SECONDS),
            refreshToken,
            expiresIn: exports.ACCESS_TTL_SECONDS,
            role: roleCode,
        };
    }
    async openSession(tx, userId, roleCode, info, refresh, refreshDays) {
        let publicKey = null;
        if (info.platform !== 'web') {
            publicKey = info.publicKey ? (0, device_proof_1.normalizeDevicePublicKey)(info.publicKey) : null;
            if (!publicKey)
                throw (0, exports.fail)(common_1.HttpStatus.BAD_REQUEST, 'DEVICE_KEY_INVALID');
        }
        const [dev] = await tx.orm
            .insert(schema_1.device)
            .values({
            userId, installId: info.installId, platform: info.platform, deviceModel: info.model, osVersion: info.osVersion, appVersion: info.appVersion,
            isRooted: info.isRooted ?? false, publicKey,
        })
            .onConflictDoUpdate({
            target: [schema_1.device.userId, schema_1.device.installId],
            set: {
                deviceModel: (0, drizzle_orm_1.sql) `excluded.device_model`, osVersion: (0, drizzle_orm_1.sql) `excluded.os_version`, appVersion: (0, drizzle_orm_1.sql) `excluded.app_version`, isRooted: (0, drizzle_orm_1.sql) `excluded.is_rooted`,
                publicKey: (0, drizzle_orm_1.sql) `coalesce(excluded.public_key, ${schema_1.device.publicKey})`, lastSeenAt: (0, drizzle_orm_1.sql) `now()`, signOutStatus: 'Active', signedOutAt: null, revokedAt: null, updatedAt: (0, drizzle_orm_1.sql) `now()`,
            },
        })
            .returning({ id: schema_1.device.id, inserted: (0, drizzle_orm_1.sql) `(xmax = 0)` });
        const [created] = await tx.orm
            .insert(schema_1.session)
            .values({ userId, deviceId: dev.id, refreshTokenHash: refresh.hash, activeRole: roleCode, expiresAt: new Date(Date.now() + refreshDays * 86_400_000) })
            .returning({ id: schema_1.session.id });
        return { pair: this.pair(userId, created.id, roleCode, refresh.token), sessionId: created.id, deviceId: dev.id, isNewDevice: dev.inserted };
    }
    async revokeSessions(tx, userId, reason, actor, options = {}) {
        const res = await tx.orm
            .update(schema_1.session)
            .set({ revokedAt: new Date(), revokeReason: reason, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.userId, userId), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt), options.exceptSessionId ? (0, drizzle_orm_1.ne)(schema_1.session.id, options.exceptSessionId) : undefined, options.deviceId ? (0, drizzle_orm_1.eq)(schema_1.session.deviceId, options.deviceId) : undefined));
        const count = res.rowCount ?? 0;
        if (count > 0) {
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'SessionsRevoked', payload: { reason, count } });
            await this.audit.record(tx, {
                category: 'AUTH', action: 'SESSIONS_REVOKED', result: 'SUCCESS', actorUserId: actor.userId, actorRole: actor.role,
                subjectUserId: userId, reasonCode: reason, changes: { count }, correlationId: (0, node_crypto_1.randomUUID)(),
            });
        }
        return count;
    }
    async securityAlert(tx, userId, roleCode, kind, details = {}) {
        await this.outbox.append(tx, {
            aggregateType: 'APP_USER', aggregateId: userId, eventType: 'SecurityAlertRaised',
            payload: { kind, role: roleCode, occurredAt: new Date().toISOString(), ...details },
        });
    }
    async loginEvent(db, input) {
        const [row] = await db.orm
            .insert(schema_1.loginEvent)
            .values({
            userId: input.userId, phoneLookupHash: input.lookup, deviceId: input.deviceId ?? null, sessionId: input.sessionId ?? null, method: input.method, result: input.result,
            deviceModel: input.device.model, osVersion: input.device.osVersion, appVersion: input.device.appVersion, isNewDevice: input.isNewDevice ?? false,
            isRooted: input.device.isRooted ?? false, ipHash: input.ip ? (0, exports.sha256)(input.ip) : null, locationSource: 'NOT_SHARED', riskFlags: input.riskFlags ?? [],
        })
            .returning({ id: schema_1.loginEvent.id });
        return row.id;
    }
    async loginRateLimited(db, ip) {
        if (!ip)
            return false;
        const [r] = await db.orm
            .select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) })
            .from(schema_1.loginEvent)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.loginEvent.ipHash, (0, exports.sha256)(ip)), (0, drizzle_orm_1.ne)(schema_1.loginEvent.result, 'SUCCESS'), (0, drizzle_orm_1.gt)(schema_1.loginEvent.occurredAt, (0, drizzle_orm_1.sql) `now() - interval '15 minutes'`)));
        return r.n >= exports.LOGIN_FAILURES_PER_IP_PER_15_MIN;
    }
    async activeRoles(db, userId, staffOnly = false) {
        const rows = await db.orm
            .select({ code: schema_1.role.code })
            .from(schema_1.userRole)
            .innerJoin(schema_1.role, (0, drizzle_orm_1.eq)(schema_1.role.id, schema_1.userRole.roleId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRole.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userRole.status, 'Active'), staffOnly ? (0, drizzle_orm_1.eq)(schema_1.role.isStaff, true) : undefined))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.role.isStaff), (0, drizzle_orm_1.asc)(schema_1.role.code));
        return rows.map((r) => r.code);
    }
    async markSignedIn(tx, userId) {
        await tx.orm.update(schema_1.credential).set({ failedAttempts: 0, lastLoginAt: new Date(), updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.credential.userId, userId));
        await tx.orm.update(schema_1.appUser).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.appUser.id, userId));
    }
    async recordLoginSuccess(tx, userId, roleCode) {
        await this.audit.record(tx, { category: 'AUTH', action: 'LOGIN_SUCCESS', result: 'SUCCESS', actorUserId: userId, actorRole: roleCode, correlationId: (0, node_crypto_1.randomUUID)() });
    }
    async recordLoginFailure(tx, userId, reason) {
        await this.audit.record(tx, {
            category: 'AUTH', action: 'LOGIN_FAILED', result: 'FAILED', actorUserId: null, actorRole: 'SYSTEM', subjectUserId: userId ?? undefined,
            reasonCode: reason, correlationId: (0, node_crypto_1.randomUUID)(),
        });
    }
    get database() {
        return this.db;
    }
};
exports.AuthSupport = AuthSupport;
exports.AuthSupport = AuthSupport = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        token_service_1.TokenService,
        sms_port_1.SmsSender,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService])
], AuthSupport);
//# sourceMappingURL=auth.support.js.map