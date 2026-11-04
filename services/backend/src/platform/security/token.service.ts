import { Inject, Injectable, Optional } from '@nestjs/common';
import { KeyObject, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export type TokenUse = 'access' | 'setup';
export const TOKEN_AUDIENCE = '/api/v1';
export const CLOCK_SKEW_SECONDS = 60;

export interface TokenClaims {
  use: TokenUse;
  iss: string;
  aud: string;
  iat: number;
  nbf: number;
  exp: number;
  sub?: string;
  sid?: string;
  role?: string;
  phone?: string;
  lang?: string;
  jti?: string;
}

export interface JsonWebKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  kid: string;
  use: 'sig';
  alg: 'ES256';
}

export const TOKEN_KEYS = Symbol('TOKEN_KEYS');

export interface TokenKeys {
  signingKey?: KeyObject;
  verifyKeys: KeyObject[];
}

type KeyConfig = Pick<AppConfig, 'nodeEnv' | 'jwtPrivateKeyPath' | 'jwtVerifyKeyPaths'>;

const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export const keyId = (publicKey: KeyObject): string =>
  createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);

const assertP256 = (key: KeyObject) => {
  const curve = (key.asymmetricKeyDetails as { namedCurve?: string } | undefined)?.namedCurve;
  if (key.asymmetricKeyType !== 'ec' || curve !== 'prime256v1') throw new Error('JWT keys must be EC P-256');
};

export function loadTokenKeys(config: KeyConfig): TokenKeys {
  const verifyKeys: KeyObject[] = [];
  let signingKey: KeyObject | undefined;
  if (config.jwtPrivateKeyPath) {
    signingKey = createPrivateKey(readFileSync(config.jwtPrivateKeyPath));
    assertP256(signingKey);
    verifyKeys.push(createPublicKey(signingKey));
  }
  for (const path of config.jwtVerifyKeyPaths ?? []) {
    const key = createPublicKey(readFileSync(path));
    assertP256(key);
    verifyKeys.push(key);
  }
  if (!signingKey && verifyKeys.length === 0) {
    if (config.nodeEnv === 'production' || config.nodeEnv === 'staging') {
      throw new Error('JWT_PRIVATE_KEY_PATH (or JWT_VERIFY_KEY_PATHS for verify-only runtimes) is required outside development');
    }
    signingKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    verifyKeys.push(createPublicKey(signingKey));
  }
  return { signingKey, verifyKeys };
}

@Injectable()
export class TokenService {
  private readonly issuer: string;
  private readonly signingKey?: KeyObject;
  private readonly signingKid?: string;
  private readonly verifyKeys = new Map<string, KeyObject>();

  constructor(@Inject(APP_CONFIG) config: AppConfig, @Optional() @Inject(TOKEN_KEYS) keys?: TokenKeys) {
    keys ??= loadTokenKeys(config);
    this.issuer = config.jwtIssuer || 'bbda';
    this.signingKey = keys.signingKey;
    for (const key of keys.verifyKeys) this.verifyKeys.set(keyId(key), key);
    if (keys.signingKey) this.signingKid = keyId(createPublicKey(keys.signingKey));
  }

  get canIssue(): boolean {
    return this.signingKey !== undefined;
  }

  issue(
    use: TokenUse,
    claims: Partial<Pick<TokenClaims, 'sub' | 'sid' | 'role' | 'phone' | 'lang' | 'jti'>>,
    ttlSeconds: number,
    now = Date.now(),
  ): string {
    if (!this.signingKey || !this.signingKid) throw new Error('this runtime holds no JWT signing key');
    const iat = Math.floor(now / 1000);
    const header = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: this.signingKid }));
    const body = b64(JSON.stringify({ ...claims, use, iss: this.issuer, aud: TOKEN_AUDIENCE, iat, nbf: iat, exp: iat + ttlSeconds }));
    const signature = sign('sha256', Buffer.from(`${header}.${body}`), { key: this.signingKey, dsaEncoding: 'ieee-p1363' });
    return `${header}.${body}.${b64(signature)}`;
  }

  verify(token: string, use: TokenUse, now = Date.now()): TokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; typ?: string; kid?: string };
      if (header.alg !== 'ES256' || (header.typ !== undefined && header.typ !== 'JWT') || typeof header.kid !== 'string') return null;
      const key = this.verifyKeys.get(header.kid);
      if (!key) return null;
      const ok = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
      if (!ok) return null;
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as TokenClaims;
      const seconds = now / 1000;
      if (claims.use !== use || claims.iss !== this.issuer || claims.aud !== TOKEN_AUDIENCE) return null;
      if (typeof claims.exp !== 'number' || claims.exp <= seconds) return null;
      if (typeof claims.iat !== 'number' || claims.iat > seconds + CLOCK_SKEW_SECONDS) return null;
      if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > seconds + CLOCK_SKEW_SECONDS)) return null;
      return claims;
    } catch {
      return null;
    }
  }

  jwks(): { keys: JsonWebKey[] } {
    const keys: JsonWebKey[] = [];
    for (const [kid, key] of this.verifyKeys) {
      const jwk = key.export({ format: 'jwk' }) as { x: string; y: string };
      keys.push({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, kid, use: 'sig', alg: 'ES256' });
    }
    return { keys };
  }
}
