import { Inject, Injectable } from '@nestjs/common';
import { KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { APP_CONFIG, AppConfig } from '../../platform/config/app-config';

export type TokenUse = 'access' | 'setup';
export interface TokenClaims {
  use: TokenUse;
  sub?: string;
  sid?: string;
  role?: string;
  phone?: string;
  lang?: string;
  jti?: string;
  iat: number;
  exp: number;
}

const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url');

@Injectable()
export class TokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.jwtPrivateKeyPath) {
      this.privateKey = createPrivateKey(readFileSync(config.jwtPrivateKeyPath));
      this.publicKey = createPublicKey(this.privateKey);
    } else if (config.nodeEnv === 'production' || config.nodeEnv === 'staging') {
      throw new Error('JWT_PRIVATE_KEY_PATH is required outside development');
    } else {
      const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
    }
  }

  issue(use: TokenUse, claims: Omit<TokenClaims, 'use' | 'iat' | 'exp'>, ttlSeconds: number, now = Date.now()): string {
    const iat = Math.floor(now / 1000);
    const header = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    const body = b64(JSON.stringify({ ...claims, use, iat, exp: iat + ttlSeconds }));
    const signature = sign('sha256', Buffer.from(`${header}.${body}`), { key: this.privateKey, dsaEncoding: 'ieee-p1363' });
    return `${header}.${body}.${b64(signature)}`;
  }

  verify(token: string, use: TokenUse, now = Date.now()): TokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string };
      if (header.alg !== 'ES256') return null;
      const ok = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: this.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
      if (!ok) return null;
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as TokenClaims;
      if (claims.use !== use || typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
      return claims;
    } catch {
      return null;
    }
  }
}
