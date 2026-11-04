import { generateKeyPairSync, sign } from 'node:crypto';
import { normalizeDevicePublicKey, proofMessage, verifyDeviceProof } from './device-proof';

const pair = () => generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = (k: ReturnType<typeof pair>) => k.publicKey.export({ type: 'spki', format: 'pem' }) as string;
const proof = (k: ReturnType<typeof pair>, kind: 'refresh' | 'step-up', subject: string, timestamp: number) => ({
  timestamp,
  signature: sign('sha256', Buffer.from(proofMessage(kind, subject, timestamp)), { key: k.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url'),
});

describe('device proof', () => {
  const now = Date.now();
  const k = pair();

  it('accepts a fresh signature from the registered key only', () => {
    expect(verifyDeviceProof(pem(k), 'refresh', 'token', proof(k, 'refresh', 'token', now), now)).toBe(true);
    expect(verifyDeviceProof(pem(pair()), 'refresh', 'token', proof(k, 'refresh', 'token', now), now)).toBe(false);
    expect(verifyDeviceProof(pem(k), 'step-up', 'token', proof(k, 'refresh', 'token', now), now)).toBe(false);
    expect(verifyDeviceProof(pem(k), 'refresh', 'other', proof(k, 'refresh', 'token', now), now)).toBe(false);
  });

  it('rejects stale or malformed proofs and non P-256 keys', () => {
    expect(verifyDeviceProof(pem(k), 'refresh', 'token', proof(k, 'refresh', 'token', now - 6 * 60_000), now)).toBe(false);
    expect(verifyDeviceProof(pem(k), 'refresh', 'token', { timestamp: now, signature: 'not-a-signature' }, now)).toBe(false);
    expect(verifyDeviceProof('garbage', 'refresh', 'token', proof(k, 'refresh', 'token', now), now)).toBe(false);
    expect(normalizeDevicePublicKey('garbage')).toBeNull();
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(normalizeDevicePublicKey(rsa.publicKey.export({ type: 'spki', format: 'pem' }) as string)).toBeNull();
    expect(normalizeDevicePublicKey(pem(k))).toContain('BEGIN PUBLIC KEY');
  });
});
