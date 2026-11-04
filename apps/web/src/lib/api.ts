import type { components, paths } from '@bbda/api-client';

type LoginPath = paths['/api/v1/web/auth/login'];
type VerifyPath = paths['/api/v1/web/auth/staff/verify-code'];

export type StaffRole = 'SUP' | 'MOD' | 'ADM';
export type LoginRequest = LoginPath['post']['requestBody']['content']['application/json'];
export type LoginResult = LoginPath['post']['responses'][200]['content']['application/json'];
export type VerifyRequest = VerifyPath['post']['requestBody']['content']['application/json'];
export type SignedIn = components['schemas']['WebSignedInDto'];
export type MfaChallenge = components['schemas']['WebMfaChallengeDto'];

export function isMfaChallenge(result: LoginResult): result is MfaChallenge {
  return 'mfaRequired' in result;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export type AppRole = StaffRole | 'DON' | 'PAT';

export const PUBLIC_ROLES: AppRole[] = ['DON', 'PAT'];
export const STAFF_ROLES: StaffRole[] = ['SUP', 'MOD', 'ADM'];

export const homeFor = (role: AppRole): string => (PUBLIC_ROLES.includes(role) ? '/home' : '/queue');

interface StaffSession {
  accessToken: string;
  role: AppRole;
}

let session: StaffSession | null = null;
let restoring: Promise<StaffSession | null> | null = null;

export function setSession(next: StaffSession | null): void {
  session = next;
}

export function currentAccessToken(): string | null {
  return session?.accessToken ?? null;
}

export function currentRole(): AppRole | null {
  return session?.role ?? null;
}

function csrfFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)bbda_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Rebuilds the in-memory session from the httpOnly refresh cookie after a page reload.
 * Shared promise: React strict mode mounts twice, and a second refresh with the rotated cookie
 * would be read as token reuse and revoke the device session.
 */
export function restoreSession(): Promise<StaffSession | null> {
  if (session) return Promise.resolve(session);
  restoring ??= (async () => {
    const csrf = csrfFromCookie();
    if (!csrf) return null;
    const response = await fetch('/api/v1/web/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as SignedIn;
    session = { accessToken: body.accessToken, role: body.role as AppRole };
    return session;
  })().finally(() => {
    restoring = null;
  });
  return restoring;
}

async function post<TPath extends keyof paths, TResponse>(path: TPath, body: unknown): Promise<TResponse> {
  const response = await fetch(path as string, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(response.status, payload.code ?? 'UNKNOWN');
  }
  return (await response.json()) as TResponse;
}

export function signIn(input: LoginRequest): Promise<LoginResult> {
  return post<'/api/v1/web/auth/login', LoginResult>('/api/v1/web/auth/login', input);
}

export function verifyStaffCode(input: VerifyRequest): Promise<SignedIn> {
  return post<'/api/v1/web/auth/staff/verify-code', SignedIn>('/api/v1/web/auth/staff/verify-code', input);
}
