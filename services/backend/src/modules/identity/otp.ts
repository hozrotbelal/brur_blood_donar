import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUESTS_PER_15_MIN = 3;

export const generateOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const hashOtp = (challengeId: string, code: string): string =>
  createHash('sha256').update(`${challengeId}:${code}`).digest('hex');

export function otpMatches(challengeId: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(challengeId, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
