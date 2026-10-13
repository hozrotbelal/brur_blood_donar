import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export const GENESIS_HASH: Buffer = Buffer.alloc(32);

export function chainHash(prevHash: Buffer, record: unknown): Buffer {
  return createHash('sha256').update(prevHash).update(canonicalJson(record)).digest();
}

export function verifyChain(rows: { prevHash: Buffer; hash: Buffer; record: unknown }[]): number {
  let expectedPrev: Buffer = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.prevHash.equals(expectedPrev) || !chainHash(row.prevHash, row.record).equals(row.hash)) return i;
    expectedPrev = row.hash;
  }
  return -1;
}

export interface AuditHashFields {
  occurredAt: string | Date;
  category: string;
  action: string;
  result: string;
  actorUserId?: string | null;
  actorRole: string;
  permissionUsed?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  subjectUserId?: string | null;
  contextRequestId?: string | null;
  fieldGroup?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
  changes?: unknown;
  correlationId: string;
  chainSeq: string | number | bigint;
}

export function auditHashRecord(f: AuditHashFields): Record<string, unknown> {
  return {
    occurredAt: new Date(f.occurredAt).toISOString(),
    category: f.category,
    action: f.action,
    result: f.result,
    actorUserId: f.actorUserId ?? null,
    actorRole: f.actorRole,
    permissionUsed: f.permissionUsed ?? null,
    entityType: f.entityType ?? null,
    entityId: f.entityId ?? null,
    subjectUserId: f.subjectUserId ?? null,
    contextRequestId: f.contextRequestId ?? null,
    fieldGroup: f.fieldGroup ?? null,
    reasonCode: f.reasonCode ?? null,
    reasonText: f.reasonText ?? null,
    changes: f.changes ?? null,
    correlationId: f.correlationId,
    chainSeq: String(f.chainSeq),
  };
}
