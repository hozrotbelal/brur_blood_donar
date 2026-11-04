import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export type Orm = NodePgDatabase;

export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
  readonly orm: Orm;
}

@Injectable()
export class DatabaseService implements Db, OnModuleDestroy {
  private readonly pool: Pool;
  readonly orm: Orm;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.orm = drizzle({ client: this.pool });
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    const tx: Db = {
      query: (text, params) => client.query(text, params),
      orm: drizzle({ client }),
    };
    try {
      await client.query('BEGIN');
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
