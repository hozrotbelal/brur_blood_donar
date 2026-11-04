import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class PartitionService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async ensureAhead(months = 6, from = new Date()): Promise<number> {
    const parents = await this.db.query<{ name: string }>(
      `SELECT p.partrelid::regclass::text AS name FROM pg_partitioned_table p WHERE p.partstrat = 'r' ORDER BY 1`,
    );
    let created = 0;
    for (const parent of parents.rows) {
      for (let i = 0; i <= months; i++) {
        const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)).toISOString().slice(0, 10);
        const before = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = $1::regclass`, [parent.name]);
        await this.db.query('SELECT platform.ensure_month_partition($1::regclass, $2::date)', [parent.name, start]);
        const after = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = $1::regclass`, [parent.name]);
        created += after.rows[0].n - before.rows[0].n;
      }
    }
    return created;
  }
}
