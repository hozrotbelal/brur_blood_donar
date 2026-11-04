import { Injectable } from '@nestjs/common';
import { Db } from '../db/database.service';
import { outboxEvent } from '../db/schema';

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
    await tx.orm
      .insert(outboxEvent)
      .values({ aggregateType: event.aggregateType, aggregateId: event.aggregateId, eventType: event.eventType, payload: event.payload, dedupeKey: outboxDedupeKey(event), status: 'Pending' })
      .onConflictDoNothing({ target: outboxEvent.dedupeKey });
  }
}
