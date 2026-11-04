import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../platform/config/app-config';
import { AuthService } from './auth.service';
import { DeviceInfo, MfaChallenge, STAFF_REFRESH_DAYS } from './auth.support';

export const REFRESH_COOKIE = 'bbda_rt';
export const CSRF_COOKIE = 'bbda_csrf';
export const BROWSER_COOKIE = 'bbda_bid';
export const CSRF_HEADER = 'x-csrf-token';
const AUTH_PATH = '/api/v1/web/auth';
const PUBLIC_WEB_ROLES = ['DON', 'PAT'];
const REFRESH_COOKIE_SECONDS = STAFF_REFRESH_DAYS * 24 * 60 * 60;
const BROWSER_COOKIE_SECONDS = 400 * 24 * 60 * 60;

export interface WebContext {
  origin?: string;
  cookieHeader?: string;
  csrfHeader?: string;
  userAgent?: string;
  ip?: string;
}

export interface WebResult<T> {
  body: T;
  cookies: string[];
}

const fail = (status: HttpStatus, code: string) => new HttpException({ code }, status);

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Injectable()
export class WebAuthService {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(input: { phone: string; password: string; role?: string }, ctx: WebContext): Promise<WebResult<any>> {
    this.checkOrigin(ctx);
    const browserId = parseCookies(ctx.cookieHeader)[BROWSER_COOKIE] || randomUUID();
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
    if ('mfaRequired' in result) return { body: result as MfaChallenge, cookies };
    return this.signedIn(result, cookies);
  }

  async verifyStaff(
    input: { challengeId: string; code: string; role?: string; trustBrowser?: boolean },
    ctx: WebContext,
  ): Promise<WebResult<any>> {
    this.checkOrigin(ctx);
    const browserId = parseCookies(ctx.cookieHeader)[BROWSER_COOKIE];
    if (!browserId) throw fail(HttpStatus.BAD_REQUEST, 'BROWSER_ID_MISSING');
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

  async refresh(ctx: WebContext): Promise<WebResult<any>> {
    this.checkOrigin(ctx);
    this.checkCsrf(ctx);
    const token = parseCookies(ctx.cookieHeader)[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException({ code: 'REFRESH_INVALID' });
    return this.signedIn(await this.auth.refresh(token), []);
  }

  async logout(ctx: WebContext): Promise<WebResult<null>> {
    this.checkOrigin(ctx);
    this.checkCsrf(ctx);
    const token = parseCookies(ctx.cookieHeader)[REFRESH_COOKIE];
    if (token) await this.auth.logoutByRefreshToken(token);
    return { body: null, cookies: this.clearCookies() };
  }

  clearCookies(): string[] {
    return [this.cookie(REFRESH_COOKIE, '', 0, true, AUTH_PATH), this.cookie(CSRF_COOKIE, '', 0, false, '/')];
  }

  private signedIn(pair: { accessToken: string; refreshToken: string; expiresIn: number; role: string }, cookies: string[]): WebResult<any> {
    const csrf = randomBytes(24).toString('base64url');
    return {
      body: { accessToken: pair.accessToken, expiresIn: pair.expiresIn, role: pair.role, csrfToken: csrf },
      cookies: [
        ...cookies,
        this.cookie(REFRESH_COOKIE, pair.refreshToken, REFRESH_COOKIE_SECONDS, true, AUTH_PATH),
        this.cookie(CSRF_COOKIE, csrf, REFRESH_COOKIE_SECONDS, false, '/'),
      ],
    };
  }

  private device(browserId: string, ctx: WebContext): DeviceInfo {
    return { installId: browserId, platform: 'web', model: (ctx.userAgent ?? 'unknown').slice(0, 100), osVersion: 'web', appVersion: 'web' };
  }

  private checkOrigin(ctx: WebContext) {
    if (!this.config.webOrigin) throw fail(HttpStatus.SERVICE_UNAVAILABLE, 'WEB_NOT_CONFIGURED');
    if (!ctx.origin) throw fail(HttpStatus.FORBIDDEN, 'ORIGIN_REQUIRED');
    if (ctx.origin !== this.config.webOrigin) throw fail(HttpStatus.FORBIDDEN, 'ORIGIN_NOT_ALLOWED');
  }

  private checkCsrf(ctx: WebContext) {
    const cookie = parseCookies(ctx.cookieHeader)[CSRF_COOKIE];
    if (!cookie || !ctx.csrfHeader || !safeEqual(cookie, ctx.csrfHeader)) throw fail(HttpStatus.FORBIDDEN, 'CSRF_INVALID');
  }

  private browserCookie(id: string) {
    return this.cookie(BROWSER_COOKIE, id, BROWSER_COOKIE_SECONDS, true, AUTH_PATH);
  }

  private cookie(name: string, value: string, maxAge: number, httpOnly: boolean, path: string) {
    return [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`, 'SameSite=Strict', httpOnly ? 'HttpOnly' : '', this.config.cookieSecure ? 'Secure' : '']
      .filter(Boolean)
      .join('; ');
  }
}
