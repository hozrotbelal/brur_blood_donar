import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db } from '../db/database.service';
import { OutboxService } from '../outbox/outbox.service';

export type AuditCategory =
  | 'AUTH' | 'DATA_CHANGE' | 'STATUS_CHANGE' | 'APPROVAL' | 'ASSIGNMENT' | 'COMMUNICATION'
  | 'SENSITIVE_READ' | 'SEARCH' | 'EXPORT' | 'LOCATION' | 'PERMISSION' | 'CONFIG';
export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILED';

export interface AuditEntry {
  category: AuditCategory;
  action: string;
  result: AuditResult;
  actorUserId: string | null;
  actorRole: 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM' | 'SYSTEM';
  permissionUsed?: string;
  entityType?: string;
  entityId?: string;
  subjectUserId?: string;
  contextRequestId?: string;
  fieldGroup?: string;
  reasonCode?: string;
  reasonText?: string;
  changes?: Record<string, unknown>;
  correlationId: string;
}

const REASON_REQUIRED: AuditCategory[] = ['SENSITIVE_READ', 'EXPORT', 'PERMISSION', 'APPROVAL'];

export function validateAuditEntry(entry: AuditEntry): void {
  if ((entry.actorRole === 'SYSTEM') !== (entry.actorUserId === null)) {
    throw new BadRequestException('SYSTEM actor must have no user id, and other roles must have one');
  }
  if (entry.result === 'SUCCESS' && REASON_REQUIRED.includes(entry.category) && !entry.reasonCode) {
    throw new BadRequestException(`${entry.category} with result SUCCESS requires a reason code`);
  }
}

@Injectable()
export class AuditService {
  constructor(private readonly outbox: OutboxService) {}

  async record(tx: Db, entry: AuditEntry): Promise<void> {
    validateAuditEntry(entry);
    await this.outbox.append(tx, {
      aggregateType: 'AUDIT',
      aggregateId: randomUUID(),
      eventType: 'AuditRecorded',
      payload: { ...entry, occurredAt: new Date().toISOString() },
    });
  }
}
