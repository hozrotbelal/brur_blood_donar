import { Injectable } from '@nestjs/common';
import { Db } from '../db/database.service';

export interface OutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  version?: number;
}

export const outboxDedupeKey = (e: Pick<OutboxEvent, 'aggregateType' | 'aggregateId' | 'eventType' | 'version'>) =>
  `${e.aggregateType}:${e.aggregateId}:${e.eventType}:${e.version ?? 1}`;

@Injectable()
export class OutboxService {
  async append(tx: Db, event: OutboxEvent): Promise<void> {
    await tx.query(
      `INSERT INTO platform.outbox_event (aggregate_type, aggregate_id, event_type, payload, dedupe_key, status)
       VALUES ($1, $2, $3, $4::jsonb, $5, 'Pending')
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [event.aggregateType, event.aggregateId, event.eventType, JSON.stringify(event.payload), outboxDedupeKey(event)],
    );
  }
}
