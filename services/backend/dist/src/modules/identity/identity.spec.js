"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const otp_1 = require("./otp");
const password_policy_1 = require("./password-policy");
const phone_1 = require("./phone");
const token_service_1 = require("./token.service");
describe('phone', () => {
    it.each(['01712345678', '8801712345678', '+8801712345678', '017-1234 5678'])('normalises %s', (input) => {
        expect((0, phone_1.normalizeBdPhone)(input)).toBe('+8801712345678');
    });
    it.each(['0171234567', '02123456789', 'abc', '+919876543210'])('rejects %s', (input) => {
        expect((0, phone_1.normalizeBdPhone)(input)).toBeNull();
    });
    it('masks the middle digits', () => expect((0, phone_1.maskPhone)('+8801712345678')).toBe('+880171XXXX78'));
});
describe('password policy', () => {
    const phone = '+8801712345678';
    it('accepts a long passphrase with spaces and Bangla', () => expect((0, password_policy_1.checkPassword)('আমার সোনার বাংলা', phone)).toEqual([]));
    it('rejects short, common and phone-based passwords', () => {
        expect((0, password_policy_1.checkPassword)('short', phone)).toContain('TOO_SHORT');
        expect((0, password_policy_1.checkPassword)('Password1', phone)).toContain('COMMON');
        expect((0, password_policy_1.checkPassword)('01712345678', phone)).toContain('SAME_AS_PHONE');
    });
    it('requires 10 characters for staff and at most 64 for everyone', () => {
        expect((0, password_policy_1.checkPassword)('123456789a', phone, true)).toEqual([]);
        expect((0, password_policy_1.checkPassword)('abcdefghi', phone, true)).toContain('TOO_SHORT');
        expect((0, password_policy_1.checkPassword)('x'.repeat(65), phone)).toContain('TOO_LONG');
    });
});
describe('otp', () => {
    it('generates six digits and matches only the right code and challenge', () => {
        const code = (0, otp_1.generateOtp)();
        expect(code).toMatch(/^\d{6}$/);
        const hash = (0, otp_1.hashOtp)('c1', code);
        expect((0, otp_1.otpMatches)('c1', code, hash)).toBe(true);
        expect((0, otp_1.otpMatches)('c1', code === '000000' ? '000001' : '000000', hash)).toBe(false);
        expect((0, otp_1.otpMatches)('c2', code, hash)).toBe(false);
    });
});
describe('token service', () => {
    const tokens = new token_service_1.TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' });
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
        expect(() => new token_service_1.TokenService({ nodeEnv: 'production', jwtPrivateKeyPath: '' })).toThrow();
    });
});
//# sourceMappingURL=identity.spec.js.map