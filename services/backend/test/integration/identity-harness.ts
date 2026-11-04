import { KeyObject, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { AuditService } from '../../src/platform/audit/audit.service';
import { DatabaseService } from '../../src/platform/db/database.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { DeviceProof, ProofKind, proofMessage } from '../../src/platform/security/device-proof';
import { TokenService } from '../../src/platform/security/token.service';
import { AuthService } from '../../src/modules/identity/auth.service';
import { AuthSupport, DeviceInfo } from '../../src/modules/identity/auth.support';
import { PasswordFlowService } from '../../src/modules/identity/password-flow.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SessionService } from '../../src/modules/identity/session.service';
import { SmsSender } from '../../src/modules/identity/sms.port';

const privateKeys = new Map<string, KeyObject>();

export function testDevice(platform: 'android' | 'ios' = 'android'): DeviceInfo {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const installId = randomUUID();
  privateKeys.set(installId, pair.privateKey);
  return { installId, platform, model: 'Test', osVersion: '14', appVersion: '0.1.0', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) as string };
}

export function deviceProof(device: Pick<DeviceInfo, 'installId'>, kind: ProofKind, subject: string, timestamp = Date.now()): DeviceProof {
  const key = privateKeys.get(device.installId);
  if (!key) throw new Error('unknown test device');
  const signature = sign('sha256', Buffer.from(proofMessage(kind, subject, timestamp)), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { timestamp, signature };
}

export const setupTokenOf = (result: unknown): string => (result as { setupToken: string }).setupToken;

export interface IdentityServices {
  auth: AuthService;
  support: AuthSupport;
  passwordFlows: PasswordFlowService;
  sessions: SessionService;
  passwords: PasswordService;
}

export function buildIdentity(db: DatabaseService, tokens: TokenService, sms: SmsSender, outbox = new OutboxService(), audit = new AuditService(outbox), passwords = new PasswordService()): IdentityServices {
  const support = new AuthSupport(db, tokens, sms, outbox, audit);
  const passwordFlows = new PasswordFlowService(db, passwords, outbox, audit, support);
  const auth = new AuthService(db, passwords, tokens, outbox, audit, support, passwordFlows);
  const sessions = new SessionService(db, outbox, audit, support);
  return { auth, support, passwordFlows, sessions, passwords };
}

export const buildAuth = (...args: Parameters<typeof buildIdentity>): AuthService => buildIdentity(...args).auth;
