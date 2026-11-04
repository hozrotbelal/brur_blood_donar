import { KeyObject, createPublicKey, verify } from 'node:crypto';

export const PROOF_MAX_SKEW_MS = 5 * 60_000;
export type ProofKind = 'refresh' | 'step-up';

export interface DeviceProof {
  timestamp: number;
  signature: string;
}

export const proofMessage = (kind: ProofKind, subject: string, timestamp: number): string => `bbda:${kind}:${subject}:${timestamp}`;

export function normalizeDevicePublicKey(pem: string): string | null {
  try {
    const key = createPublicKey(pem);
    const curve = (key.asymmetricKeyDetails as { namedCurve?: string } | undefined)?.namedCurve;
    if (key.asymmetricKeyType !== 'ec' || curve !== 'prime256v1') return null;
    return key.export({ type: 'spki', format: 'pem' }) as string;
  } catch {
    return null;
  }
}

export function verifyDeviceProof(publicKeyPem: string, kind: ProofKind, subject: string, proof: DeviceProof, now = Date.now()): boolean {
  if (!Number.isFinite(proof.timestamp) || Math.abs(now - proof.timestamp) > PROOF_MAX_SKEW_MS) return false;
  let key: KeyObject;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return false;
  }
  try {
    const message = Buffer.from(proofMessage(kind, subject, proof.timestamp));
    return verify('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(proof.signature, 'base64url'));
  } catch {
    return false;
  }
}
