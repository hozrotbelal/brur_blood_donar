import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../platform/db/database.service';
import { DomainEvent, EventBus } from '../../platform/outbox/event-bus';
import { GENESIS_HASH, auditHashRecord, chainHash } from './hash-chain';

@Injectable()
export class AuditWriter implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    this.bus.subscribe('AuditRecorded', (event) => this.write(event));
  }

  async write(event: DomainEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['aud.audit_event.chain']);
      const last = await tx.query<{ chain_seq: string; hash: Buffer }>(
        'SELECT chain_seq, hash FROM aud.audit_event ORDER BY chain_seq DESC LIMIT 1',
      );
      const prevHash = last.rows[0]?.hash ?? GENESIS_HASH;
      const chainSeq = last.rows[0] ? BigInt(last.rows[0].chain_seq) + 1n : 1n;
      const hash = chainHash(prevHash, auditHashRecord({ ...(p as unknown as Parameters<typeof auditHashRecord>[0]), chainSeq }));
      await tx.query(
        `INSERT INTO aud.audit_event
           (occurred_at, category, action, result, actor_user_id, actor_role, permission_used, entity_type,
            entity_id, subject_user_id, context_request_id, field_group, reason_code, reason_text, changes,
            correlation_id, chain_seq, prev_hash, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)`,
        [
          p.occurredAt, p.category, p.action, p.result, p.actorUserId ?? null, p.actorRole,
          p.permissionUsed ?? null, p.entityType ?? null, p.entityId ?? null, p.subjectUserId ?? null,
          p.contextRequestId ?? null, p.fieldGroup ?? null, p.reasonCode ?? null, p.reasonText ?? null,
          p.changes ? JSON.stringify(p.changes) : null, p.correlationId, chainSeq.toString(), prevHash, hash,
        ],
      );
    });
  }
}
