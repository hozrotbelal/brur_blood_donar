import { generateOtp, hashOtp, otpMatches } from './otp';
import { checkPassword } from './password-policy';
import { maskPhone, normalizeBdPhone } from './phone';
import { TokenService } from './token.service';
import { AppConfig } from '../../platform/config/app-config';

describe('phone', () => {
  it.each(['01712345678', '8801712345678', '+8801712345678', '017-1234 5678'])('normalises %s', (input) => {
    expect(normalizeBdPhone(input)).toBe('+8801712345678');
  });
  it.each(['0171234567', '02123456789', 'abc', '+919876543210'])('rejects %s', (input) => {
    expect(normalizeBdPhone(input)).toBeNull();
  });
  it('masks the middle digits', () => expect(maskPhone('+8801712345678')).toBe('+880171XXXX78'));
});

describe('password policy', () => {
  const phone = '+8801712345678';
  it('accepts a long passphrase with spaces and Bangla', () => expect(checkPassword('আমার সোনার বাংলা', phone)).toEqual([]));
  it('rejects short, common and phone-based passwords', () => {
    expect(checkPassword('short', phone)).toContain('TOO_SHORT');
    expect(checkPassword('Password1', phone)).toContain('COMMON');
    expect(checkPassword('01712345678', phone)).toContain('SAME_AS_PHONE');
  });
  it('requires 10 characters for staff and at most 64 for everyone', () => {
    expect(checkPassword('123456789a', phone, true)).toEqual([]);
    expect(checkPassword('abcdefghi', phone, true)).toContain('TOO_SHORT');
    expect(checkPassword('x'.repeat(65), phone)).toContain('TOO_LONG');
  });
});

describe('otp', () => {
  it('generates six digits and matches only the right code and challenge', () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    const hash = hashOtp('c1', code);
    expect(otpMatches('c1', code, hash)).toBe(true);
    expect(otpMatches('c1', code === '000000' ? '000001' : '000000', hash)).toBe(false);
    expect(otpMatches('c2', code, hash)).toBe(false);
  });
});

describe('token service', () => {
  const tokens = new TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' } as AppConfig);
  it('round-trips a token of the right use', () => {
    const t = tokens.issue('access', { sub: 'u1', sid: 's1', role: 'DON' }, 60);
    expect(tokens.verify(t, 'access')?.sub).toBe('u1');
  });
  it('rejects wrong use, expiry, tampering and alg none', () => {
    const t = tokens.issue('access', { sub: 'u1' }, 60, Date.now());
    expect(tokens.verify(t, 'setup')).toBeNull();
    expect(tokens.verify(t, 'access', Date.now() + 61_000)).toBeNull();
    const [h, b, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ use: 'access', sub: 'admin', exp: 9999999999 })).toString('base64url');
    expect(tokens.verify(`${h}.${forged}.${s}`, 'access')).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    expect(tokens.verify(`${none}.${b}.`, 'access')).toBeNull();
  });
  it('refuses to start without a key in production', () => {
    expect(() => new TokenService({ nodeEnv: 'production', jwtPrivateKeyPath: '' } as AppConfig)).toThrow();
  });
});
