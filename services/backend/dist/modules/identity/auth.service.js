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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.SETUP_TTL_SECONDS = exports.ACCESS_TTL_SECONDS = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const app_config_1 = require("../../platform/config/app-config");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const device_proof_1 = require("../../platform/security/device-proof");
const token_service_1 = require("../../platform/security/token.service");
const auth_support_1 = require("./auth.support");
const password_flow_service_1 = require("./password-flow.service");
const password_service_1 = require("./password.service");
const password_policy_1 = require("./password-policy");
const phone_1 = require("./phone");
const schema_1 = require("./schema");
var auth_support_2 = require("./auth.support");
Object.defineProperty(exports, "ACCESS_TTL_SECONDS", { enumerable: true, get: function () { return auth_support_2.ACCESS_TTL_SECONDS; } });
Object.defineProperty(exports, "SETUP_TTL_SECONDS", { enumerable: true, get: function () { return auth_support_2.SETUP_TTL_SECONDS; } });
const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };
let AuthService = AuthService_1 = class AuthService {
    db;
    passwords;
    tokens;
    outbox;
    audit;
    support;
    passwordFlows;
    dummyHash;
    skipStaffSmsCode;
    constructor(db, passwords, tokens, outbox, audit, support, passwordFlows, config) {
        this.db = db;
        this.passwords = passwords;
        this.tokens = tokens;
        this.outbox = outbox;
        this.audit = audit;
        this.support = support;
        this.passwordFlows = passwordFlows;
        this.skipStaffSmsCode = config?.devSkipStaffSmsCode === true && (config.nodeEnv === 'development' || config.nodeEnv === 'test');
        if (this.skipStaffSmsCode)
            new common_1.Logger(AuthService_1.name).warn('DEV_SKIP_STAFF_SMS_CODE is on: staff sign in without the SMS second step (development only)');
    }
    async register(input) {
        const phone = (0, phone_1.normalizeBdPhone)(input.phone);
        if (!phone)
            throw new common_1.BadRequestException({ code: 'INVALID_PHONE' });
        return this.support.issueOtp(this.db, { phone, purpose: 'REGISTRATION', ip: input.ip });
    }
    async loginOtp(input) {
        const phone = (0, phone_1.normalizeBdPhone)(input.phone);
        if (phone && (await this.support.otpAllowed(this.db, phone, 'LOGIN_FALLBACK', input.ip))) {
            const [user] = await this.db.orm
                .select({ id: schema_1.appUser.id })
                .from(schema_1.appUser)
                .leftJoin(schema_1.credential, (0, drizzle_orm_1.eq)(schema_1.credential.userId, schema_1.appUser.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.phoneE164, phone), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt), (0, drizzle_orm_1.eq)(schema_1.appUser.isStaff, false), (0, drizzle_orm_1.eq)(schema_1.appUser.accountStatus, 'Active'), (0, drizzle_orm_1.sql) `(${schema_1.credential.lockedUntil} is null or ${schema_1.credential.lockedUntil} <= now())`));
            if (user) {
                const otp = await this.support.createOtp(this.db, { phone, purpose: 'LOGIN_FALLBACK', userId: user.id, ip: input.ip });
                void this.support.sendCode(phone, otp.code).catch(() => undefined);
            }
        }
        return { accepted: true };
    }
    async verifyOtp(input) {
        const purpose = await this.support.purposeOf(this.db, input.challengeId);
        switch (purpose) {
            case 'REGISTRATION':
                return this.verifyRegistrationOtp(input);
            case 'PASSWORD_RESET':
                return this.verifyResetOtp(input);
            case 'LOGIN_FALLBACK':
                return this.verifyLoginOtp(input);
            default:
                throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
        }
    }
    async verifyRegistrationOtp(input) {
        if (!input.role || !input.language)
            throw new common_1.BadRequestException({ code: 'ROLE_AND_LANGUAGE_REQUIRED' });
        const outcome = await this.db.transaction((tx) => this.support.consumeOtp(tx, input.challengeId, input.code, 'REGISTRATION'));
        if (!outcome.ok)
            throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
        const setupToken = this.tokens.issue('setup', { phone: outcome.phone, role: input.role, lang: input.language, jti: input.challengeId }, auth_support_1.SETUP_TTL_SECONDS);
        return { setupToken };
    }
    async verifyResetOtp(input) {
        return this.db.transaction(async (tx) => {
            const outcome = await this.support.consumeOtp(tx, input.challengeId, input.code, 'PASSWORD_RESET');
            if (!outcome.ok || !outcome.userId)
                throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
            return this.passwordFlows.issueResetToken(tx, input.challengeId);
        });
    }
    async verifyLoginOtp(input) {
        if (!input.device)
            throw new common_1.BadRequestException({ code: 'DEVICE_REQUIRED' });
        const info = input.device;
        const refresh = this.support.newRefreshToken();
        return this.db.transaction(async (tx) => {
            const outcome = await this.support.consumeOtp(tx, input.challengeId, input.code, 'LOGIN_FALLBACK');
            if (!outcome.ok || !outcome.userId)
                throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
            const [user] = await tx.orm
                .select({ id: schema_1.appUser.id, accountStatus: schema_1.appUser.accountStatus, isStaff: schema_1.appUser.isStaff })
                .from(schema_1.appUser)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, outcome.userId), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)))
                .for('no key update');
            const lookup = (0, auth_support_1.sha256)(outcome.phone);
            if (!user || user.isStaff || user.accountStatus !== 'Active') {
                await this.support.loginEvent(tx, { userId: outcome.userId, lookup, device: info, ip: input.ip, result: 'DENIED_POLICY', method: 'SMS_CODE' });
                throw (0, auth_support_1.fail)(common_1.HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE');
            }
            const roles = await this.support.activeRoles(tx, outcome.userId);
            const roleCode = input.role ?? roles[0];
            if (!roleCode || !roles.includes(roleCode))
                throw (0, auth_support_1.fail)(common_1.HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
            await this.support.markSignedIn(tx, outcome.userId);
            const opened = await this.support.openSession(tx, outcome.userId, roleCode, info, refresh, auth_support_1.PUBLIC_REFRESH_DAYS);
            await this.afterSignIn(tx, outcome.userId, roleCode, lookup, info, input.ip, 'SMS_CODE', opened);
            return opened.pair;
        });
    }
    async setPassword(input) {
        const claims = this.tokens.verify(input.setupToken, 'setup');
        if (!claims?.phone || !claims.role || !claims.jti)
            throw new common_1.UnauthorizedException({ code: 'SETUP_TOKEN_INVALID' });
        const problems = (0, password_policy_1.checkPassword)(input.password, claims.phone);
        if (problems.length)
            throw new common_1.BadRequestException({ code: 'PASSWORD_REJECTED', problems });
        const hash = await this.passwords.hash(input.password);
        const refresh = this.support.newRefreshToken();
        const roleCode = claims.role;
        const phone = claims.phone;
        return this.db.transaction(async (tx) => {
            const [existing] = await tx.orm.select({ id: schema_1.appUser.id }).from(schema_1.appUser).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.phoneE164, phone), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)));
            if (existing)
                throw new common_1.ConflictException({ code: 'ACCOUNT_EXISTS' });
            const [user] = await tx.orm
                .insert(schema_1.appUser)
                .values({ phoneE164: phone, phoneVerifiedAt: new Date(), preferredLanguage: claims.lang === 'en' ? 'en' : 'bn' })
                .returning({ id: schema_1.appUser.id });
            const userId = user.id;
            const [roleRow] = await tx.orm.select({ id: schema_1.role.id }).from(schema_1.role).where((0, drizzle_orm_1.eq)(schema_1.role.code, roleCode));
            await tx.orm.insert(schema_1.userRole).values({ userId, roleId: roleRow.id, status: 'Active', assignedAt: new Date() });
            await tx.orm.insert(schema_1.credential).values({ userId, passwordHash: hash, hashAlgorithm: 'ARGON2ID', hashParams: HASH_PARAMS, passwordSetAt: new Date() });
            const opened = await this.support.openSession(tx, userId, roleCode, input.device, refresh, auth_support_1.PUBLIC_REFRESH_DAYS);
            await this.support.loginEvent(tx, {
                userId, lookup: (0, auth_support_1.sha256)(phone), device: input.device, ip: input.ip, result: 'SUCCESS', method: 'PASSWORD', sessionId: opened.sessionId, deviceId: opened.deviceId, isNewDevice: true,
            });
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'UserRegistered', payload: { role: roleCode } });
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'DeviceBound', payload: { deviceId: opened.deviceId, platform: input.device.platform } });
            await this.audit.record(tx, {
                category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId, actorRole: roleCode,
                entityType: 'app_user', entityId: userId, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return opened.pair;
        });
    }
    async login(input) {
        if (await this.support.loginRateLimited(this.db, input.ip))
            throw (0, auth_support_1.fail)(common_1.HttpStatus.TOO_MANY_REQUESTS, 'LOGIN_RATE_LIMITED');
        const phone = (0, phone_1.normalizeBdPhone)(input.phone);
        const lookup = (0, auth_support_1.sha256)(phone ?? input.phone);
        const user = phone ? await this.credential(this.db, phone) : undefined;
        if (!user) {
            await this.passwords.verify(await this.getDummyHash(), input.password).catch(() => false);
            await this.support.loginEvent(this.db, { userId: null, lookup, device: input.device, ip: input.ip, result: 'FAILED_PASSWORD', method: 'PASSWORD' });
            await this.support.recordLoginFailure(this.db, null, 'UNKNOWN_NUMBER');
            throw new common_1.UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
        }
        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
            await this.support.loginEvent(this.db, { userId: user.id, lookup, device: input.device, ip: input.ip, result: 'LOCKED', method: 'PASSWORD' });
            await this.support.recordLoginFailure(this.db, user.id, 'LOCKED');
            throw new common_1.UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
        }
        const valid = await this.passwords.verify(user.passwordHash, input.password).catch(() => false);
        if (!valid) {
            await this.registerFailure(user, lookup, input);
            throw new common_1.UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
        }
        if (user.accountStatus !== 'Active') {
            await this.support.loginEvent(this.db, { userId: user.id, lookup, device: input.device, ip: input.ip, result: 'DENIED_POLICY', method: 'PASSWORD' });
            await this.support.recordLoginFailure(this.db, user.id, 'ACCOUNT_NOT_ACTIVE');
            throw (0, auth_support_1.fail)(common_1.HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE');
        }
        if (input.staffOnly && !user.isStaff) {
            await this.support.loginEvent(this.db, { userId: user.id, lookup, device: input.device, ip: input.ip, result: 'DENIED_POLICY', method: 'PASSWORD' });
            await this.support.recordLoginFailure(this.db, user.id, 'STAFF_ONLY');
            throw (0, auth_support_1.fail)(common_1.HttpStatus.FORBIDDEN, 'STAFF_ONLY');
        }
        if (user.isStaff && !this.skipStaffSmsCode && !(await this.deviceIsMfaTrusted(user.id, input.device.installId, input.mfaTrustDays ?? auth_support_1.STAFF_MFA_DAYS))) {
            return this.startStaffMfa(user.id, phone, input.ip);
        }
        const refresh = this.support.newRefreshToken();
        return this.db.transaction(async (tx) => {
            const roles = await this.support.activeRoles(tx, user.id);
            const roleCode = (input.role ?? roles[0]);
            if (!roleCode || !roles.includes(roleCode))
                throw (0, auth_support_1.fail)(common_1.HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
            await this.support.markSignedIn(tx, user.id);
            const opened = await this.support.openSession(tx, user.id, roleCode, input.device, refresh, user.isStaff ? auth_support_1.STAFF_REFRESH_DAYS : auth_support_1.PUBLIC_REFRESH_DAYS);
            await this.afterSignIn(tx, user.id, roleCode, lookup, input.device, input.ip, 'PASSWORD', opened);
            return opened.pair;
        });
    }
    async verifyStaffMfa(input) {
        const outcome = await this.db.transaction((tx) => this.support.consumeOtp(tx, input.challengeId, input.code, 'STAFF_MFA'));
        if (!outcome.ok || !outcome.userId)
            throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
        const userId = outcome.userId;
        const refresh = this.support.newRefreshToken();
        return this.db.transaction(async (tx) => {
            const roles = await this.support.activeRoles(tx, userId, true);
            const roleCode = (input.role ?? roles[0]);
            if (!roleCode || !roles.includes(roleCode))
                throw (0, auth_support_1.fail)(common_1.HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
            const opened = await this.support.openSession(tx, userId, roleCode, input.device, refresh, auth_support_1.STAFF_REFRESH_DAYS);
            await tx.orm
                .update(schema_1.device)
                .set({ staffMfaVerifiedAt: input.trustDevice ?? true ? new Date() : null, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.device.id, opened.deviceId));
            await this.support.markSignedIn(tx, userId);
            await this.afterSignIn(tx, userId, roleCode, (0, auth_support_1.sha256)(outcome.phone), input.device, input.ip, 'STAFF_2STEP', opened);
            return opened.pair;
        });
    }
    async refresh(refreshToken, proof) {
        const hash = (0, auth_support_1.sha256)(refreshToken);
        const result = await this.db.transaction(async (tx) => {
            const [current] = await tx.orm
                .select({
                id: schema_1.session.id, userId: schema_1.session.userId, deviceId: schema_1.session.deviceId, activeRole: schema_1.session.activeRole, expiresAt: schema_1.session.expiresAt, stepUpAt: schema_1.session.stepUpAt,
                revoked: (0, drizzle_orm_1.sql) `${schema_1.session.revokedAt} is not null`, expired: (0, drizzle_orm_1.sql) `${schema_1.session.expiresAt} <= now()`,
                superseded: (0, drizzle_orm_1.exists)(tx.orm.select({ one: (0, drizzle_orm_1.sql) `1` }).from((0, drizzle_orm_1.sql) `idn.session c`).where((0, drizzle_orm_1.sql) `c.rotated_from_id = ${schema_1.session.id}`)),
                publicKey: schema_1.device.publicKey, deviceStatus: schema_1.device.signOutStatus, accountStatus: schema_1.appUser.accountStatus, deleted: (0, drizzle_orm_1.sql) `${schema_1.appUser.deletedAt} is not null`,
            })
                .from(schema_1.session)
                .innerJoin(schema_1.device, (0, drizzle_orm_1.eq)(schema_1.device.id, schema_1.session.deviceId))
                .innerJoin(schema_1.appUser, (0, drizzle_orm_1.eq)(schema_1.appUser.id, schema_1.session.userId))
                .where((0, drizzle_orm_1.eq)(schema_1.session.refreshTokenHash, hash))
                .for('no key update');
            if (!current || current.revoked || current.expired)
                return { ok: false, code: 'REFRESH_INVALID' };
            if (current.superseded) {
                await this.support.revokeSessions(tx, current.userId, 'ROTATION_REUSE', { userId: null, role: 'SYSTEM' }, { deviceId: current.deviceId });
                return { ok: false, code: 'REFRESH_INVALID' };
            }
            if (current.publicKey && !(proof && (0, device_proof_1.verifyDeviceProof)(current.publicKey, 'refresh', refreshToken, proof))) {
                return { ok: false, code: 'DEVICE_PROOF_INVALID' };
            }
            if (current.accountStatus !== 'Active' || current.deleted) {
                await this.support.revokeSessions(tx, current.userId, 'ACCOUNT_SUSPENDED', { userId: null, role: 'SYSTEM' });
                return { ok: false, code: 'REFRESH_INVALID' };
            }
            if (current.deviceStatus !== 'Active') {
                await this.support.revokeSessions(tx, current.userId, 'DEVICE_REVOKED', { userId: null, role: 'SYSTEM' }, { deviceId: current.deviceId });
                return { ok: false, code: 'REFRESH_INVALID' };
            }
            const next = this.support.newRefreshToken();
            const [created] = await tx.orm
                .insert(schema_1.session)
                .values({ userId: current.userId, deviceId: current.deviceId, refreshTokenHash: next.hash, rotatedFromId: current.id, activeRole: current.activeRole, expiresAt: current.expiresAt, stepUpAt: current.stepUpAt })
                .returning({ id: schema_1.session.id });
            await tx.orm.update(schema_1.device).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.device.id, current.deviceId));
            return { ok: true, pair: this.support.pair(current.userId, created.id, current.activeRole, next.token) };
        });
        if (!result.ok)
            throw new common_1.UnauthorizedException({ code: result.code });
        return result.pair;
    }
    async logoutByRefreshToken(refreshToken) {
        const [row] = await this.db.orm
            .select({ id: schema_1.session.id, userId: schema_1.session.userId, activeRole: schema_1.session.activeRole })
            .from(schema_1.session)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.refreshTokenHash, (0, auth_support_1.sha256)(refreshToken)), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt)));
        if (row)
            await this.logout(row.id, row.userId, row.activeRole);
    }
    async logout(sessionId, userId, roleCode) {
        await this.db.transaction(async (tx) => {
            await tx.orm
                .update(schema_1.session)
                .set({ revokedAt: new Date(), revokeReason: 'LOGOUT', updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.id, sessionId), (0, drizzle_orm_1.eq)(schema_1.session.userId, userId), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt)));
            await this.audit.record(tx, {
                category: 'AUTH', action: 'LOGOUT', result: 'SUCCESS', actorUserId: userId,
                actorRole: roleCode, correlationId: (0, node_crypto_1.randomUUID)(),
            });
        });
    }
    async loadGrants(userId, roleCode) {
        const allowed = (0, drizzle_orm_1.sql) `${roleCode}::role_code = any (${schema_1.permission.allowedRoles})`;
        const base = this.db.orm
            .select({ key: schema_1.permission.key, scope: schema_1.permissionSetItem.scope, requiresStepUp: schema_1.permission.requiresStepUp, expiresAt: (0, drizzle_orm_1.sql) `null::timestamptz`.as('expires_at') })
            .from(schema_1.permissionSet)
            .innerJoin(schema_1.permissionSetItem, (0, drizzle_orm_1.eq)(schema_1.permissionSetItem.permissionSetId, schema_1.permissionSet.id))
            .innerJoin(schema_1.permission, (0, drizzle_orm_1.eq)(schema_1.permission.id, schema_1.permissionSetItem.permissionId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.kind, 'BASE'), (0, drizzle_orm_1.eq)(schema_1.permissionSet.status, 'Active'), (0, drizzle_orm_1.eq)(schema_1.permissionSet.roleCode, roleCode), allowed));
        const granted = this.db.orm
            .select({ key: schema_1.permission.key, scope: schema_1.permissionSetItem.scope, requiresStepUp: schema_1.permission.requiresStepUp, expiresAt: (0, drizzle_orm_1.sql) `${schema_1.userPermissionSet.expiresAt}`.as('expires_at') })
            .from(schema_1.userPermissionSet)
            .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId), (0, drizzle_orm_1.eq)(schema_1.permissionSet.status, 'Active'), (0, drizzle_orm_1.eq)(schema_1.permissionSet.roleCode, roleCode)))
            .innerJoin(schema_1.permissionSetItem, (0, drizzle_orm_1.eq)(schema_1.permissionSetItem.permissionSetId, schema_1.permissionSet.id))
            .innerJoin(schema_1.permission, (0, drizzle_orm_1.eq)(schema_1.permission.id, schema_1.permissionSetItem.permissionId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.sql) `${schema_1.userPermissionSet.effectiveFrom} <= now()`, (0, drizzle_orm_1.sql) `(${schema_1.userPermissionSet.expiresAt} is null or ${schema_1.userPermissionSet.expiresAt} > now())`, allowed));
        const rows = await base.unionAll(granted);
        return rows.map((r) => ({ key: r.key, scope: r.scope, expiresAt: r.expiresAt, requiresStepUp: r.requiresStepUp }));
    }
    async resolveSession(sessionId, userId, roleCode) {
        const [row] = await this.db.orm
            .select({ stepUpAt: schema_1.session.stepUpAt, deviceId: schema_1.session.deviceId })
            .from(schema_1.session)
            .innerJoin(schema_1.appUser, (0, drizzle_orm_1.eq)(schema_1.appUser.id, schema_1.session.userId))
            .innerJoin(schema_1.device, (0, drizzle_orm_1.eq)(schema_1.device.id, schema_1.session.deviceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.id, sessionId), (0, drizzle_orm_1.eq)(schema_1.session.userId, userId), (0, drizzle_orm_1.eq)(schema_1.session.activeRole, roleCode), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt), (0, drizzle_orm_1.gt)(schema_1.session.expiresAt, (0, drizzle_orm_1.sql) `now()`), (0, drizzle_orm_1.eq)(schema_1.appUser.accountStatus, 'Active'), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt), (0, drizzle_orm_1.eq)(schema_1.device.signOutStatus, 'Active')));
        return row ? { stepUpAt: row.stepUpAt, deviceId: row.deviceId } : null;
    }
    async sessionIsActive(sessionId, userId, roleCode) {
        return (await this.resolveSession(sessionId, userId, roleCode)) !== null;
    }
    async credential(db, phone) {
        const [row] = await db.orm
            .select({
            id: schema_1.appUser.id, accountStatus: schema_1.appUser.accountStatus, isStaff: schema_1.appUser.isStaff, passwordHash: schema_1.credential.passwordHash,
            lockedUntil: schema_1.credential.lockedUntil, failedAttempts: schema_1.credential.failedAttempts, lockCount24h: schema_1.credential.lockCount24h,
        })
            .from(schema_1.appUser)
            .innerJoin(schema_1.credential, (0, drizzle_orm_1.eq)(schema_1.credential.userId, schema_1.appUser.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.phoneE164, phone), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)));
        return row;
    }
    async registerFailure(user, lookup, input) {
        const failures = user.failedAttempts + 1;
        const lock = failures >= auth_support_1.LOCK_AFTER_FAILURES;
        const minutes = Math.min(auth_support_1.LOCK_BASE_MINUTES * 2 ** user.lockCount24h, auth_support_1.LOCK_MAX_MINUTES);
        await this.db.transaction(async (tx) => {
            await tx.orm
                .update(schema_1.credential)
                .set({
                failedAttempts: lock ? 0 : failures,
                lockCount24h: lock ? (0, drizzle_orm_1.sql) `${schema_1.credential.lockCount24h} + 1` : schema_1.credential.lockCount24h,
                lockedUntil: lock ? (0, auth_support_1.minutesFromNow)(minutes) : schema_1.credential.lockedUntil,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.credential.userId, user.id));
            await this.support.loginEvent(tx, {
                userId: user.id, lookup, device: input.device, ip: input.ip, result: 'FAILED_PASSWORD', method: 'PASSWORD', riskFlags: lock ? ['MANY_FAILURES'] : [],
            });
            await this.support.recordLoginFailure(tx, user.id, 'WRONG_PASSWORD');
            if (lock) {
                const roleCode = (await this.support.activeRoles(tx, user.id))[0] ?? 'DON';
                await this.audit.record(tx, {
                    category: 'AUTH', action: 'ACCOUNT_LOCKED', result: 'SUCCESS', actorUserId: null, actorRole: 'SYSTEM', subjectUserId: user.id,
                    reasonCode: 'MANY_FAILURES', changes: { minutes }, correlationId: (0, node_crypto_1.randomUUID)(),
                });
                await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: user.id, eventType: 'AccountLocked', payload: { minutes } });
                await this.support.securityAlert(tx, user.id, roleCode, 'ACCOUNT_LOCKED', { minutes });
            }
        });
    }
    async afterSignIn(tx, userId, roleCode, lookup, info, ip, method, opened) {
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
    async deviceIsMfaTrusted(userId, installId, days) {
        if (days <= 0)
            return false;
        const [row] = await this.db.orm
            .select({ id: schema_1.device.id })
            .from(schema_1.device)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.device.userId, userId), (0, drizzle_orm_1.eq)(schema_1.device.installId, installId), (0, drizzle_orm_1.eq)(schema_1.device.signOutStatus, 'Active'), (0, drizzle_orm_1.gt)(schema_1.device.staffMfaVerifiedAt, (0, drizzle_orm_1.sql) `now() - make_interval(days => ${days}::int)`)));
        return row !== undefined;
    }
    async startStaffMfa(userId, phone, ip) {
        const { challengeId, expiresInSeconds } = await this.support.issueOtp(this.db, { phone, purpose: 'STAFF_MFA', userId, ip });
        return { mfaRequired: true, challengeId, expiresInSeconds };
    }
    getDummyHash() {
        this.dummyHash ??= this.passwords.hash((0, node_crypto_1.randomUUID)());
        return this.dummyHash;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(7, (0, common_1.Optional)()),
    __param(7, (0, common_1.Inject)(app_config_1.APP_CONFIG)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        password_service_1.PasswordService,
        token_service_1.TokenService,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService,
        auth_support_1.AuthSupport,
        password_flow_service_1.PasswordFlowService, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map