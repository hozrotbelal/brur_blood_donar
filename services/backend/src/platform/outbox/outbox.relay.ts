import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { EventBus } from './event-bus';

@Injectable()
export class OutboxRelay {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  async publishPending(batchSize = 50): Promise<number> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        payload: Record<string, unknown>;
      }>(
        `SELECT id, aggregate_type, aggregate_id, event_type, payload
           FROM platform.outbox_event
          WHERE status = 'Pending'
          ORDER BY created_at
          LIMIT $1
          FOR NO KEY UPDATE SKIP LOCKED`,
        [batchSize],
      );
      for (const row of rows) {
        try {
          await this.bus.publish({
            id: row.id,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            eventType: row.event_type,
            payload: row.payload,
          });
          await tx.query("UPDATE platform.outbox_event SET status = 'Published', published_at = now() WHERE id = $1", [
            row.id,
          ]);
        } catch {
          await tx.query("UPDATE platform.outbox_event SET status = 'Failed' WHERE id = $1", [row.id]);
        }
      }
      return rows.length;
    });
  }
}
