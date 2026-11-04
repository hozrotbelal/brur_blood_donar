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
exports.AuthService = exports.SETUP_TTL_SECONDS = exports.ACCESS_TTL_SECONDS = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const otp_1 = require("./otp");
const password_service_1 = require("./password.service");
const password_policy_1 = require("./password-policy");
const phone_1 = require("./phone");
const sms_port_1 = require("./sms.port");
const token_service_1 = require("./token.service");
exports.ACCESS_TTL_SECONDS = 900;
exports.SETUP_TTL_SECONDS = 900;
const PUBLIC_REFRESH_DAYS = 30;
const STAFF_REFRESH_DAYS = 1;
const STAFF_MFA_DAYS = 30;
const LOCK_AFTER_FAILURES = 5;
const LOCK_BASE_MINUTES = 15;
const LOCK_MAX_MINUTES = 1440;
const sha256 = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
const fail = (status, code) => new common_1.HttpException({ code }, status);
let AuthService = class AuthService {
    db;
    passwords;
    tokens;
    sms;
    outbox;
    audit;
    dummyHash;
    constructor(db, passwords, tokens, sms, outbox, audit) {
        this.db = db;
        this.passwords = passwords;
        this.tokens = tokens;
        this.sms = sms;
        this.outbox = outbox;
        this.audit = audit;
    }
    async register(input) {
        const phone = (0, phone_1.normalizeBdPhone)(input.phone);
        if (!phone)
            throw new common_1.BadRequestException({ code: 'INVALID_PHONE' });
        const recent = await this.db.query(`SELECT count(*)::int AS n FROM idn.otp_challenge
        WHERE phone_e164 = $1 AND purpose = 'REGISTRATION' AND created_at > now() - interval '15 minutes'`, [phone]);
        if (recent.rows[0].n >= otp_1.OTP_REQUESTS_PER_15_MIN)
            throw fail(common_1.HttpStatus.TOO_MANY_REQUESTS, 'OTP_RATE_LIMITED');
        const challengeId = (0, node_crypto_1.randomUUID)();
        const code = (0, otp_1.generateOtp)();
        await this.db.query(`INSERT INTO idn.otp_challenge (id, phone_e164, purpose, code_hash, expires_at, request_ip)
       VALUES ($1, $2, 'REGISTRATION', $3, now() + make_interval(secs => $4), $5)`, [challengeId, phone, (0, otp_1.hashOtp)(challengeId, code), otp_1.OTP_TTL_SECONDS, input.ip ?? null]);
        await this.sms.send(phone, `BBDA code: ${code}`);
        return { challengeId, expiresInSeconds: otp_1.OTP_TTL_SECONDS };
    }
    async verifyOtp(input) {
        const outcome = await this.db.transaction(async (tx) => {
            const { rows } = await tx.query(`SELECT phone_e164, code_hash, attempts, consumed_at, expires_at <= now() AS expired
           FROM idn.otp_challenge WHERE id = $1 AND purpose = 'REGISTRATION' FOR NO KEY UPDATE`, [input.challengeId]);
            const row = rows[0];
            if (!row || row.consumed_at || row.expired || row.attempts >= otp_1.OTP_MAX_ATTEMPTS)
                return { ok: false };
            if (!(0, otp_1.otpMatches)(input.challengeId, input.code, row.code_hash)) {
                await tx.query('UPDATE idn.otp_challenge SET attempts = attempts + 1 WHERE id = $1', [input.challengeId]);
                return { ok: false };
            }
            await tx.query('UPDATE idn.otp_challenge SET consumed_at = now() WHERE id = $1', [input.challengeId]);
            return { ok: true, phone: row.phone_e164 };
        });
        if (!outcome.ok)
            throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
        const setupToken = this.tokens.issue('setup', { phone: outcome.phone, role: input.role, lang: input.language, jti: input.challengeId }, exports.SETUP_TTL_SECONDS);
        return { setupToken };
    }
    async setPassword(input) {
        const claims = this.tokens.verify(input.setupToken, 'setup');
        if (!claims?.phone || !claims.role || !claims.jti)
            throw new common_1.UnauthorizedException({ code: 'SETUP_TOKEN_INVALID' });
        const problems = (0, password_policy_1.checkPassword)(input.password, claims.phone);
        if (problems.length)
            throw new common_1.BadRequestException({ code: 'PASSWORD_REJECTED', problems });
        const hash = await this.passwords.hash(input.password);
        const refresh = this.newRefreshToken();
        return this.db.transaction(async (tx) => {
            const existing = await tx.query('SELECT 1 FROM idn.app_user WHERE phone_e164 = $1 AND deleted_at IS NULL', [claims.phone]);
            if (existing.rows.length)
                throw new common_1.ConflictException({ code: 'ACCOUNT_EXISTS' });
            const user = await tx.query(`INSERT INTO idn.app_user (phone_e164, phone_verified_at, preferred_language)
         VALUES ($1, now(), $2) RETURNING id`, [claims.phone, claims.lang === 'en' ? 'en' : 'bn']);
            const userId = user.rows[0].id;
            await tx.query(`INSERT INTO idn.user_role (user_id, role_id, status, reason)
         SELECT $1, id, 'Active', NULL FROM idn.role WHERE code = $2`, [userId, claims.role]);
            await tx.query(`INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at)
         VALUES ($1, $2, 'ARGON2ID', '{"memoryKiB":19456,"timeCost":2,"parallelism":1}'::jsonb, now())`, [userId, hash]);
            const pair = await this.openSession(tx, userId, claims.role, input.device, refresh);
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'UserRegistered', payload: { role: claims.role } });
            await this.audit.record(tx, {
                category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId,
                actorRole: claims.role, entityType: 'app_user', entityId: userId, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return pair;
        });
    }
    async login(input) {
        const phone = (0, phone_1.normalizeBdPhone)(input.phone);
        const lookup = sha256(phone ?? input.phone);
        const user = phone
            ? (await this.db.query(`SELECT u.id, u.account_status, u.is_staff, c.password_hash, c.locked_until, c.failed_attempts, c.lock_count_24h
               FROM idn.app_user u JOIN idn.credential c ON c.user_id = u.id
              WHERE u.phone_e164 = $1 AND u.deleted_at IS NULL`, [phone])).rows[0]
            : undefined;
        if (!user) {
            await this.passwords.verify(await this.getDummyHash(), input.password).catch(() => false);
            await this.loginEvent(this.db, null, lookup, input, 'FAILED_PASSWORD');
            throw new common_1.UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
        }
        if (user.locked_until && user.locked_until.getTime() > Date.now()) {
            await this.loginEvent(this.db, user.id, lookup, input, 'LOCKED');
            throw fail(common_1.HttpStatus.LOCKED, 'ACCOUNT_LOCKED');
        }
        const valid = await this.passwords.verify(user.password_hash, input.password).catch(() => false);
        if (!valid) {
            const failures = user.failed_attempts + 1;
            const lock = failures >= LOCK_AFTER_FAILURES;
            const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** user.lock_count_24h, LOCK_MAX_MINUTES);
            await this.db.query(`UPDATE idn.credential SET failed_attempts = $2, lock_count_24h = lock_count_24h + $3,
                locked_until = CASE WHEN $3 = 1 THEN now() + make_interval(mins => $4) ELSE locked_until END, updated_at = now()
          WHERE user_id = $1`, [user.id, lock ? 0 : failures, lock ? 1 : 0, minutes]);
            await this.loginEvent(this.db, user.id, lookup, input, 'FAILED_PASSWORD');
            throw new common_1.UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
        }
        if (user.account_status !== 'Active') {
            await this.loginEvent(this.db, user.id, lookup, input, 'DENIED_POLICY');
            throw fail(common_1.HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE');
        }
        if (input.staffOnly && !user.is_staff) {
            await this.loginEvent(this.db, user.id, lookup, input, 'DENIED_POLICY');
            throw fail(common_1.HttpStatus.FORBIDDEN, 'STAFF_ONLY');
        }
        if (user.is_staff && !(await this.deviceIsMfaTrusted(user.id, input.device.installId, input.mfaTrustDays ?? STAFF_MFA_DAYS))) {
            return this.startStaffMfa(user.id, phone, input.ip);
        }
        const refresh = this.newRefreshToken();
        return this.db.transaction(async (tx) => {
            const roles = await tx.query(`SELECT r.code FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.status = 'Active' ORDER BY r.code`, [user.id]);
            const role = input.role ?? roles.rows[0]?.code;
            if (!role || !roles.rows.some((r) => r.code === role))
                throw fail(common_1.HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
            await tx.query('UPDATE idn.credential SET failed_attempts = 0, last_login_at = now(), updated_at = now() WHERE user_id = $1', [user.id]);
            await tx.query('UPDATE idn.app_user SET last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);
            const pair = await this.openSession(tx, user.id, role, input.device, refresh, user.is_staff ? STAFF_REFRESH_DAYS : PUBLIC_REFRESH_DAYS);
            await this.loginEvent(tx, user.id, lookup, input, 'SUCCESS');
            await this.audit.record(tx, {
                category: 'AUTH', action: 'LOGIN_SUCCESS', result: 'SUCCESS', actorUserId: user.id,
                actorRole: role, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return pair;
        });
    }
    async verifyStaffMfa(input) {
        const outcome = await this.db.transaction(async (tx) => {
            const { rows } = await tx.query(`SELECT user_id, phone_e164, code_hash, attempts, consumed_at, expires_at <= now() AS expired
           FROM idn.otp_challenge WHERE id = $1 AND purpose = 'STAFF_MFA' FOR NO KEY UPDATE`, [input.challengeId]);
            const row = rows[0];
            if (!row || !row.user_id || row.consumed_at || row.expired || row.attempts >= otp_1.OTP_MAX_ATTEMPTS)
                return { ok: false };
            if (!(0, otp_1.otpMatches)(input.challengeId, input.code, row.code_hash)) {
                await tx.query('UPDATE idn.otp_challenge SET attempts = attempts + 1 WHERE id = $1', [input.challengeId]);
                return { ok: false };
            }
            await tx.query('UPDATE idn.otp_challenge SET consumed_at = now() WHERE id = $1', [input.challengeId]);
            return { ok: true, userId: row.user_id, phone: row.phone_e164 };
        });
        if (!outcome.ok)
            throw new common_1.BadRequestException({ code: 'OTP_INVALID' });
        const refresh = this.newRefreshToken();
        return this.db.transaction(async (tx) => {
            const roles = await tx.query(`SELECT r.code FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.status = 'Active' AND r.is_staff ORDER BY r.code`, [outcome.userId]);
            const role = input.role ?? roles.rows[0]?.code;
            if (!role || !roles.rows.some((r) => r.code === role))
                throw fail(common_1.HttpStatus.FORBIDDEN, 'ROLE_NOT_HELD');
            const pair = await this.openSession(tx, outcome.userId, role, input.device, refresh, STAFF_REFRESH_DAYS);
            await tx.query('UPDATE idn.device SET staff_mfa_verified_at = CASE WHEN $3::boolean THEN now() ELSE NULL END WHERE user_id = $1 AND install_id = $2', [outcome.userId, input.device.installId, input.trustDevice ?? true]);
            await tx.query('UPDATE idn.credential SET failed_attempts = 0, last_login_at = now(), updated_at = now() WHERE user_id = $1', [outcome.userId]);
            await tx.query('UPDATE idn.app_user SET last_login_at = now(), updated_at = now() WHERE id = $1', [outcome.userId]);
            await this.loginEvent(tx, outcome.userId, sha256(outcome.phone), input, 'SUCCESS', 'STAFF_2STEP');
            await this.audit.record(tx, {
                category: 'AUTH', action: 'LOGIN_SUCCESS', result: 'SUCCESS', actorUserId: outcome.userId,
                actorRole: role, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return pair;
        });
    }
    async refresh(refreshToken) {
        const hash = sha256(refreshToken);
        const result = await this.db.transaction(async (tx) => {
            const { rows } = await tx.query(`SELECT s.id, s.user_id, s.device_id, s.active_role, s.revoked_at IS NOT NULL AS revoked, s.expires_at <= now() AS expired,
                EXISTS (SELECT 1 FROM idn.session c WHERE c.rotated_from_id = s.id) AS superseded
           FROM idn.session s WHERE s.refresh_token_hash = $1 FOR NO KEY UPDATE`, [hash]);
            const session = rows[0];
            if (!session || session.revoked || session.expired)
                return { ok: false };
            if (session.superseded) {
                await tx.query(`UPDATE idn.session SET revoked_at = now(), revoke_reason = 'ROTATION_REUSE'
            WHERE device_id = $1 AND revoked_at IS NULL`, [session.device_id]);
                return { ok: false };
            }
            const next = this.newRefreshToken();
            const created = await tx.query(`INSERT INTO idn.session (user_id, device_id, refresh_token_hash, rotated_from_id, active_role, expires_at)
         SELECT user_id, device_id, $2, id, active_role, expires_at FROM idn.session WHERE id = $1 RETURNING id`, [session.id, next.hash]);
            return { ok: true, pair: this.pair(session.user_id, created.rows[0].id, session.active_role, next.token) };
        });
        if (!result.ok)
            throw new common_1.UnauthorizedException({ code: 'REFRESH_INVALID' });
        return result.pair;
    }
    async logoutByRefreshToken(refreshToken) {
        const { rows } = await this.db.query('SELECT id, user_id, active_role FROM idn.session WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [sha256(refreshToken)]);
        if (rows[0])
            await this.logout(rows[0].id, rows[0].user_id, rows[0].active_role);
    }
    async logout(sessionId, userId, role) {
        await this.db.transaction(async (tx) => {
            await tx.query(`UPDATE idn.session SET revoked_at = now(), revoke_reason = 'LOGOUT' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [sessionId, userId]);
            await this.audit.record(tx, {
                category: 'AUTH', action: 'LOGOUT', result: 'SUCCESS', actorUserId: userId,
                actorRole: role, correlationId: (0, node_crypto_1.randomUUID)(),
            });
        });
    }
    async loadGrants(userId, role) {
        const { rows } = await this.db.query(`SELECT p.key, i.scope, NULL::timestamptz AS expires_at
         FROM idn.permission_set s
         JOIN idn.permission_set_item i ON i.permission_set_id = s.id
         JOIN idn.permission p ON p.id = i.permission_id
        WHERE s.kind = 'BASE' AND s.status = 'Active' AND s.role_code = $2
       UNION ALL
       SELECT key, scope, expires_at FROM idn.v_effective_permission WHERE user_id = $1`, [userId, role]);
        return rows.map((r) => ({ key: r.key, scope: r.scope, expiresAt: r.expires_at }));
    }
    async sessionIsActive(sessionId, userId) {
        const { rows } = await this.db.query(`SELECT 1 FROM idn.session s JOIN idn.app_user u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.account_status = 'Active'`, [sessionId, userId]);
        return rows.length > 0;
    }
    async deviceIsMfaTrusted(userId, installId, days) {
        if (days <= 0)
            return false;
        const { rows } = await this.db.query(`SELECT 1 FROM idn.device WHERE user_id = $1 AND install_id = $2 AND sign_out_status = 'Active'
          AND staff_mfa_verified_at > now() - make_interval(days => $3)`, [userId, installId, days]);
        return rows.length > 0;
    }
    async startStaffMfa(userId, phone, ip) {
        const recent = await this.db.query(`SELECT count(*)::int AS n FROM idn.otp_challenge
        WHERE phone_e164 = $1 AND purpose = 'STAFF_MFA' AND created_at > now() - interval '15 minutes'`, [phone]);
        if (recent.rows[0].n >= otp_1.OTP_REQUESTS_PER_15_MIN)
            throw fail(common_1.HttpStatus.TOO_MANY_REQUESTS, 'OTP_RATE_LIMITED');
        const challengeId = (0, node_crypto_1.randomUUID)();
        const code = (0, otp_1.generateOtp)();
        await this.db.query(`INSERT INTO idn.otp_challenge (id, phone_e164, user_id, purpose, code_hash, expires_at, request_ip)
       VALUES ($1, $2, $3, 'STAFF_MFA', $4, now() + make_interval(secs => $5), $6)`, [challengeId, phone, userId, (0, otp_1.hashOtp)(challengeId, code), otp_1.OTP_TTL_SECONDS, ip ?? null]);
        await this.sms.send(phone, `BBDA code: ${code}`);
        return { mfaRequired: true, challengeId, expiresInSeconds: otp_1.OTP_TTL_SECONDS };
    }
    newRefreshToken() {
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        return { token, hash: sha256(token) };
    }
    pair(userId, sessionId, role, refreshToken) {
        return {
            accessToken: this.tokens.issue('access', { sub: userId, sid: sessionId, role }, exports.ACCESS_TTL_SECONDS),
            refreshToken,
            expiresIn: exports.ACCESS_TTL_SECONDS,
            role,
        };
    }
    async openSession(tx, userId, role, device, refresh, refreshDays = PUBLIC_REFRESH_DAYS) {
        const dev = await tx.query(`INSERT INTO idn.device (user_id, install_id, platform, device_model, os_version, app_version, is_rooted)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, install_id) DO UPDATE
         SET device_model = EXCLUDED.device_model, os_version = EXCLUDED.os_version, app_version = EXCLUDED.app_version,
             is_rooted = EXCLUDED.is_rooted, last_seen_at = now(), sign_out_status = 'Active', updated_at = now()
       RETURNING id`, [userId, device.installId, device.platform, device.model, device.osVersion, device.appVersion, device.isRooted ?? false]);
        const session = await tx.query(`INSERT INTO idn.session (user_id, device_id, refresh_token_hash, active_role, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id`, [userId, dev.rows[0].id, refresh.hash, role, refreshDays]);
        return this.pair(userId, session.rows[0].id, role, refresh.token);
    }
    async loginEvent(db, userId, lookup, input, result, method = 'PASSWORD') {
        await db.query(`INSERT INTO idn.login_event (user_id, phone_lookup_hash, method, result, device_model, os_version, app_version, is_rooted,
                                   ip_hash, location_source, risk_flags)
       VALUES ($1, $2, $9, $3, $4, $5, $6, $7, $8, 'NOT_SHARED', '{}')`, [userId, lookup, result, input.device.model, input.device.osVersion, input.device.appVersion, input.device.isRooted ?? false, input.ip ? sha256(input.ip) : null, method]);
    }
    getDummyHash() {
        this.dummyHash ??= this.passwords.hash((0, node_crypto_1.randomUUID)());
        return this.dummyHash;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        password_service_1.PasswordService,
        token_service_1.TokenService,
        sms_port_1.SmsSender,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService])
], AuthService);
//# sourceMappingURL=auth.service.js.map