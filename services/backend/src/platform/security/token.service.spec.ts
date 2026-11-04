import { generateKeyPairSync } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { TOKEN_AUDIENCE, TokenService, keyId } from './token.service';

const config = (over: Partial<AppConfig> = {}) => ({ nodeEnv: 'test', jwtIssuer: 'bbda', jwtPrivateKeyPath: '', jwtVerifyKeyPaths: [], ...over }) as AppConfig;
const pair = () => generateKeyPairSync('ec', { namedCurve: 'P-256' });

describe('token service', () => {
  it('issues standard claims with a key id and verifies them', () => {
    const tokens = new TokenService(config());
    const t = tokens.issue('access', { sub: 'u1', sid: 's1', role: 'DON' }, 60);
    const header = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString());
    expect(header).toMatchObject({ alg: 'ES256', typ: 'JWT' });
    expect(typeof header.kid).toBe('string');
    const claims = tokens.verify(t, 'access')!;
    expect(claims).toMatchObject({ sub: 'u1', sid: 's1', role: 'DON', iss: 'bbda', aud: TOKEN_AUDIENCE });
    expect(claims.nbf).toBe(claims.iat);
  });

  it('rejects another issuer, an unknown key, tokens from the future and tampering', () => {
    const a = new TokenService(config());
    const b = new TokenService(config({ jwtIssuer: 'other' }));
    const t = a.issue('access', { sub: 'u1' }, 60);
    expect(b.verify(t, 'access')).toBeNull();
    expect(new TokenService(config()).verify(t, 'access')).toBeNull();
    expect(a.verify(a.issue('access', { sub: 'u1' }, 60, Date.now() + 5 * 60_000), 'access')).toBeNull();
    expect(a.verify(a.issue('access', { sub: 'u1' }, 60, Date.now() + 30_000), 'access')).not.toBeNull();
    const [h, , s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ use: 'access', sub: 'admin', iss: 'bbda', aud: TOKEN_AUDIENCE, exp: 9999999999, iat: 1 })).toString('base64url');
    expect(a.verify(`${h}.${forged}.${s}`, 'access')).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: 'none', kid: JSON.parse(Buffer.from(h, 'base64url').toString()).kid })).toString('base64url');
    expect(a.verify(`${none}.${t.split('.')[1]}.`, 'access')).toBeNull();
  });

  it('keeps verifying tokens from the previous key during rotation and in verify-only runtimes', () => {
    const old = pair();
    const current = pair();
    const before = new TokenService(config(), { signingKey: old.privateKey, verifyKeys: [old.publicKey] });
    const issuedBefore = before.issue('access', { sub: 'u1' }, 60);
    const after = new TokenService(config(), { signingKey: current.privateKey, verifyKeys: [current.publicKey, old.publicKey] });
    expect(after.verify(issuedBefore, 'access')?.sub).toBe('u1');
    expect(after.jwks().keys.map((k) => k.kid).sort()).toEqual([keyId(old.publicKey), keyId(current.publicKey)].sort());

    const verifyOnly = new TokenService(config(), { verifyKeys: [current.publicKey] });
    expect(verifyOnly.canIssue).toBe(false);
    expect(verifyOnly.verify(after.issue('access', { sub: 'u2' }, 60), 'access')?.sub).toBe('u2');
    expect(() => verifyOnly.issue('access', {}, 60)).toThrow();
  });

  it('refuses to start without keys in production', () => {
    expect(() => new TokenService(config({ nodeEnv: 'production' }))).toThrow();
  });
});
