import { Injectable } from '@nestjs/common';
import { Db } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { StateMachine } from './state-machine';

export interface StatusChange<S extends string> {
  entityType: string;
  entityId: string;
  from: S | null;
  to: S;
  actorUserId: string | null;
  actorRole: 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM' | 'SYSTEM';
  source: 'USER' | 'SYSTEM' | 'INTEGRATION';
  contextRequestId?: string;
  reasonCode?: string;
  reason?: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class StatusHistoryService {
  constructor(private readonly audit: AuditService) {}

  async record<S extends string>(tx: Db, change: StatusChange<S>, machine?: StateMachine<S>): Promise<void> {
    if (machine && change.from !== null) machine.assert(change.from, change.to);
    await tx.query(
      `INSERT INTO aud.status_history
         (entity_type, entity_id, context_request_id, from_status, to_status, actor_user_id, actor_role,
          source, reason_code, reason, correlation_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        change.entityType,
        change.entityId,
        change.contextRequestId ?? null,
        change.from,
        change.to,
        change.actorUserId,
        change.actorRole,
        change.source,
        change.reasonCode ?? null,
        change.reason ?? null,
        change.correlationId,
        change.details ? JSON.stringify(change.details) : null,
      ],
    );
    await this.audit.record(tx, {
      category: 'STATUS_CHANGE',
      action: 'STATUS_CHANGE',
      result: 'SUCCESS',
      actorUserId: change.actorUserId,
      actorRole: change.actorRole,
      entityType: change.entityType,
      entityId: change.entityId,
      contextRequestId: change.contextRequestId,
      changes: { from: change.from, to: change.to },
      correlationId: change.correlationId,
    });
  }
}
