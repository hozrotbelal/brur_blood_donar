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
exports.WebAuthService = exports.CSRF_HEADER = exports.BROWSER_COOKIE = exports.CSRF_COOKIE = exports.REFRESH_COOKIE = void 0;
exports.parseCookies = parseCookies;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const app_config_1 = require("../../platform/config/app-config");
const auth_service_1 = require("./auth.service");
const auth_support_1 = require("./auth.support");
exports.REFRESH_COOKIE = 'bbda_rt';
exports.CSRF_COOKIE = 'bbda_csrf';
exports.BROWSER_COOKIE = 'bbda_bid';
exports.CSRF_HEADER = 'x-csrf-token';
const AUTH_PATH = '/api/v1/web/auth';
const PUBLIC_WEB_ROLES = ['DON', 'PAT'];
const REFRESH_COOKIE_SECONDS = auth_support_1.STAFF_REFRESH_DAYS * 24 * 60 * 60;
const BROWSER_COOKIE_SECONDS = 400 * 24 * 60 * 60;
const fail = (status, code) => new common_1.HttpException({ code }, status);
function parseCookies(header) {
    const out = {};
    for (const part of (header ?? '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0)
            out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}
const safeEqual = (a, b) => a.length === b.length && (0, node_crypto_1.timingSafeEqual)(Buffer.from(a), Buffer.from(b));
let WebAuthService = class WebAuthService {
    auth;
    config;
    constructor(auth, config) {
        this.auth = auth;
        this.config = config;
    }
    async login(input, ctx) {
        this.checkOrigin(ctx);
        const browserId = parseCookies(ctx.cookieHeader)[exports.BROWSER_COOKIE] || (0, node_crypto_1.randomUUID)();
        const result = await this.auth.login({
            phone: input.phone,
            password: input.password,
            role: input.role,
            ip: ctx.ip,
            staffOnly: !PUBLIC_WEB_ROLES.includes(input.role ?? ''),
            mfaTrustDays: this.config.webTrustedBrowserDays,
            device: this.device(browserId, ctx),
        });
        const cookies = [this.browserCookie(browserId)];
        if ('mfaRequired' in result)
            return { body: result, cookies };
        return this.signedIn(result, cookies);
    }
    async verifyStaff(input, ctx) {
        this.checkOrigin(ctx);
        const browserId = parseCookies(ctx.cookieHeader)[exports.BROWSER_COOKIE];
        if (!browserId)
            throw fail(common_1.HttpStatus.BAD_REQUEST, 'BROWSER_ID_MISSING');
        const pair = await this.auth.verifyStaffMfa({
            challengeId: input.challengeId,
            code: input.code,
            role: input.role,
            ip: ctx.ip,
            trustDevice: this.config.webTrustedBrowserDays > 0 && input.trustBrowser !== false,
            device: this.device(browserId, ctx),
        });
        return this.signedIn(pair, [this.browserCookie(browserId)]);
    }
    async refresh(ctx) {
        this.checkOrigin(ctx);
        this.checkCsrf(ctx);
        const token = parseCookies(ctx.cookieHeader)[exports.REFRESH_COOKIE];
        if (!token)
            throw new common_1.UnauthorizedException({ code: 'REFRESH_INVALID' });
        return this.signedIn(await this.auth.refresh(token), []);
    }
    async logout(ctx) {
        this.checkOrigin(ctx);
        this.checkCsrf(ctx);
        const token = parseCookies(ctx.cookieHeader)[exports.REFRESH_COOKIE];
        if (token)
            await this.auth.logoutByRefreshToken(token);
        return { body: null, cookies: this.clearCookies() };
    }
    clearCookies() {
        return [this.cookie(exports.REFRESH_COOKIE, '', 0, true, AUTH_PATH), this.cookie(exports.CSRF_COOKIE, '', 0, false, '/')];
    }
    signedIn(pair, cookies) {
        const csrf = (0, node_crypto_1.randomBytes)(24).toString('base64url');
        return {
            body: { accessToken: pair.accessToken, expiresIn: pair.expiresIn, role: pair.role, csrfToken: csrf },
            cookies: [
                ...cookies,
                this.cookie(exports.REFRESH_COOKIE, pair.refreshToken, REFRESH_COOKIE_SECONDS, true, AUTH_PATH),
                this.cookie(exports.CSRF_COOKIE, csrf, REFRESH_COOKIE_SECONDS, false, '/'),
            ],
        };
    }
    device(browserId, ctx) {
        return { installId: browserId, platform: 'web', model: (ctx.userAgent ?? 'unknown').slice(0, 100), osVersion: 'web', appVersion: 'web' };
    }
    checkOrigin(ctx) {
        if (!this.config.webOrigin)
            throw fail(common_1.HttpStatus.SERVICE_UNAVAILABLE, 'WEB_NOT_CONFIGURED');
        if (!ctx.origin)
            throw fail(common_1.HttpStatus.FORBIDDEN, 'ORIGIN_REQUIRED');
        if (ctx.origin !== this.config.webOrigin)
            throw fail(common_1.HttpStatus.FORBIDDEN, 'ORIGIN_NOT_ALLOWED');
    }
    checkCsrf(ctx) {
        const cookie = parseCookies(ctx.cookieHeader)[exports.CSRF_COOKIE];
        if (!cookie || !ctx.csrfHeader || !safeEqual(cookie, ctx.csrfHeader))
            throw fail(common_1.HttpStatus.FORBIDDEN, 'CSRF_INVALID');
    }
    browserCookie(id) {
        return this.cookie(exports.BROWSER_COOKIE, id, BROWSER_COOKIE_SECONDS, true, AUTH_PATH);
    }
    cookie(name, value, maxAge, httpOnly, path) {
        return [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`, 'SameSite=Strict', httpOnly ? 'HttpOnly' : '', this.config.cookieSecure ? 'Secure' : '']
            .filter(Boolean)
            .join('; ');
    }
};
exports.WebAuthService = WebAuthService;
exports.WebAuthService = WebAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(app_config_1.APP_CONFIG)),
    __metadata("design:paramtypes", [auth_service_1.AuthService, Object])
], WebAuthService);
//# sourceMappingURL=web-auth.service.js.map