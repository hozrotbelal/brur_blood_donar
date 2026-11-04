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
exports.PasswordFlowService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const auth_support_1 = require("./auth.support");
const password_service_1 = require("./password.service");
const password_policy_1 = require("./password-policy");
const phone_1 = require("./phone");
const schema_1 = require("./schema");
const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };
let PasswordFlowService = class PasswordFlowService {
    db;
    passwords;
    outbox;
    audit;
    support;
    constructor(db, passwords, outbox, audit, support) {
        this.db = db;
        this.passwords = passwords;
        this.outbox = outbox;
        this.audit = audit;
        this.support = support;
    }
    async forgot(input) {
        const phone = (0, phone_1.normalizeBdPhone)(input.phone);
        if (!phone || !(await this.support.otpAllowed(this.db, phone, 'PASSWORD_RESET', input.ip)))
            return { accepted: true };
        const [user] = await this.db.orm
            .select({ id: schema_1.appUser.id })
            .from(schema_1.appUser)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.phoneE164, phone), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt), (0, drizzle_orm_1.inArray)(schema_1.appUser.accountStatus, ['Active', 'Locked'])));
        if (!user)
            return { accepted: true };
        const code = await this.db.transaction(async (tx) => {
            const otp = await this.support.createOtp(tx, { phone, purpose: 'PASSWORD_RESET', userId: user.id, ip: input.ip });
            await tx.orm.insert(schema_1.passwordReset).values({
                userId: user.id, otpChallengeId: otp.challengeId, status: 'Requested', requestedAt: new Date(),
                expiresAt: new Date(Date.now() + otp.expiresInSeconds * 1000), ipHash: input.ip ? (0, auth_support_1.sha256)(input.ip) : null,
            });
            await this.audit.record(tx, {
                category: 'AUTH', action: 'PASSWORD_RESET_REQUESTED', result: 'SUCCESS', actorUserId: null, actorRole: 'SYSTEM', subjectUserId: user.id, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return otp.code;
        });
        void this.support.sendCode(phone, code).catch(() => undefined);
        return { accepted: true };
    }
    async issueResetToken(tx, challengeId) {
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const res = await tx.orm
            .update(schema_1.passwordReset)
            .set({ status: 'Verified', resetTokenHash: (0, auth_support_1.sha256)(token), expiresAt: (0, auth_support_1.minutesFromNow)(auth_support_1.RESET_TOKEN_TTL_MINUTES), version: (0, drizzle_orm_1.sql) `${schema_1.passwordReset.version} + 1`, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.passwordReset.otpChallengeId, challengeId), (0, drizzle_orm_1.eq)(schema_1.passwordReset.status, 'Requested')));
        if (!res.rowCount)
            throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
        return { resetToken: token, expiresInSeconds: auth_support_1.RESET_TOKEN_TTL_MINUTES * 60 };
    }
    async reset(input) {
        return this.db.transaction(async (tx) => {
            const [reset] = await tx.orm
                .select({ id: schema_1.passwordReset.id, userId: schema_1.passwordReset.userId, status: schema_1.passwordReset.status, expired: (0, drizzle_orm_1.sql) `${schema_1.passwordReset.expiresAt} <= now()` })
                .from(schema_1.passwordReset)
                .where((0, drizzle_orm_1.eq)(schema_1.passwordReset.resetTokenHash, (0, auth_support_1.sha256)(input.resetToken)))
                .for('update');
            if (!reset || reset.status !== 'Verified' || reset.expired) {
                if (reset && reset.status === 'Verified' && reset.expired) {
                    await tx.orm.update(schema_1.passwordReset).set({ status: 'Expired', version: (0, drizzle_orm_1.sql) `${schema_1.passwordReset.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.passwordReset.id, reset.id));
                }
                throw (0, auth_support_1.fail)(common_1.HttpStatus.GONE, 'RESET_TOKEN_INVALID');
            }
            const account = await this.account(tx, reset.userId);
            if (!account || !['Active', 'Locked'].includes(account.accountStatus))
                throw (0, auth_support_1.fail)(common_1.HttpStatus.GONE, 'RESET_TOKEN_INVALID');
            const roleCode = (await this.support.activeRoles(tx, account.id))[0] ?? 'DON';
            await this.storeNewPassword(tx, account, input.password, true);
            await tx.orm.update(schema_1.passwordReset).set({ status: 'Completed', completedAt: new Date(), version: (0, drizzle_orm_1.sql) `${schema_1.passwordReset.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.passwordReset.id, reset.id));
            await this.support.revokeSessions(tx, account.id, 'PASSWORD_RESET', { userId: account.id, role: roleCode });
            await tx.orm.update(schema_1.device).set({ staffMfaVerifiedAt: null, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.device.userId, account.id));
            await this.audit.record(tx, {
                category: 'AUTH', action: 'PASSWORD_RESET_COMPLETED', result: 'SUCCESS', actorUserId: account.id, actorRole: roleCode, entityType: 'credential', entityId: account.id,
                correlationId: (0, node_crypto_1.randomUUID)(),
            });
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: account.id, eventType: 'PasswordReset', payload: { role: roleCode, isStaff: account.isStaff } });
            await this.support.securityAlert(tx, account.id, roleCode, 'PASSWORD_RESET');
            if (account.isStaff)
                return { signedIn: false };
            const opened = await this.support.openSession(tx, account.id, roleCode, input.device, this.support.newRefreshToken(), auth_support_1.PUBLIC_REFRESH_DAYS);
            await this.support.loginEvent(tx, {
                userId: account.id, lookup: (0, auth_support_1.sha256)(account.phone), device: input.device, ip: input.ip, result: 'SUCCESS', method: 'PASSWORD',
                sessionId: opened.sessionId, deviceId: opened.deviceId, isNewDevice: opened.isNewDevice, riskFlags: opened.isNewDevice ? ['NEW_DEVICE'] : [],
            });
            await this.support.recordLoginSuccess(tx, account.id, roleCode);
            return { signedIn: true, tokens: opened.pair };
        });
    }
    async change(principal, input) {
        return this.db.transaction(async (tx) => {
            const account = await this.account(tx, principal.userId);
            if (!account)
                throw new common_1.UnauthorizedException({ code: 'UNAUTHENTICATED' });
            const valid = await this.passwords.verify(account.passwordHash, input.currentPassword).catch(() => false);
            if (!valid)
                throw new common_1.UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
            await this.storeNewPassword(tx, account, input.newPassword, false);
            const revoked = input.signOutOtherDevices === false
                ? 0
                : await this.support.revokeSessions(tx, account.id, 'PASSWORD_CHANGED', { userId: account.id, role: principal.role }, { exceptSessionId: principal.sessionId });
            await this.audit.record(tx, {
                category: 'AUTH', action: 'PASSWORD_CHANGED', result: 'SUCCESS', actorUserId: account.id, actorRole: principal.role, entityType: 'credential', entityId: account.id,
                correlationId: (0, node_crypto_1.randomUUID)(),
            });
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: account.id, eventType: 'PasswordChanged', payload: { role: principal.role } });
            await this.support.securityAlert(tx, account.id, principal.role, 'PASSWORD_CHANGED');
            return { otherSessionsRevoked: revoked };
        });
    }
    async account(db, userId) {
        const [row] = await db.orm
            .select({ id: schema_1.appUser.id, phone: schema_1.appUser.phoneE164, isStaff: schema_1.appUser.isStaff, accountStatus: schema_1.appUser.accountStatus, passwordHash: schema_1.credential.passwordHash })
            .from(schema_1.appUser)
            .innerJoin(schema_1.credential, (0, drizzle_orm_1.eq)(schema_1.credential.userId, schema_1.appUser.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, userId), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)))
            .for('no key update');
        return row;
    }
    async storeNewPassword(tx, account, password, clearLock) {
        const problems = (0, password_policy_1.checkPassword)(password, account.phone, account.isStaff);
        if (problems.length)
            throw new common_1.BadRequestException({ code: 'PASSWORD_REJECTED', problems });
        if (account.isStaff)
            await this.assertNotReused(tx, account, password);
        const hash = await this.passwords.hash(password);
        if (account.isStaff)
            await tx.orm.insert(schema_1.passwordHistory).values({ userId: account.id, passwordHash: account.passwordHash });
        await tx.orm
            .update(schema_1.credential)
            .set({
            passwordHash: hash, hashAlgorithm: 'ARGON2ID', hashParams: HASH_PARAMS, passwordSetAt: new Date(), mustChange: false,
            ...(clearLock ? { failedAttempts: 0, lockedUntil: null, lockCount24h: 0 } : {}),
            version: (0, drizzle_orm_1.sql) `${schema_1.credential.version} + 1`, updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.credential.userId, account.id));
        if (clearLock)
            await tx.orm.update(schema_1.appUser).set({ accountStatus: 'Active', updatedAt: new Date() }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, account.id), (0, drizzle_orm_1.eq)(schema_1.appUser.accountStatus, 'Locked')));
    }
    async assertNotReused(tx, account, password) {
        const rows = await tx.orm
            .select({ hash: schema_1.passwordHistory.passwordHash })
            .from(schema_1.passwordHistory)
            .where((0, drizzle_orm_1.eq)(schema_1.passwordHistory.userId, account.id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.passwordHistory.createdAt))
            .limit(auth_support_1.STAFF_PASSWORD_HISTORY - 1);
        for (const hash of [account.passwordHash, ...rows.map((r) => r.hash)]) {
            if (await this.passwords.verify(hash, password).catch(() => false))
                throw new common_1.BadRequestException({ code: 'PASSWORD_REJECTED', problems: ['REUSED'] });
        }
    }
};
exports.PasswordFlowService = PasswordFlowService;
exports.PasswordFlowService = PasswordFlowService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        password_service_1.PasswordService,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService,
        auth_support_1.AuthSupport])
], PasswordFlowService);
//# sourceMappingURL=password-flow.service.js.map