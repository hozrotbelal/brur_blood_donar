import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';

export type IdempotencyStatus = 'In progress' | 'Completed' | 'Failed';

export interface IdempotencyRecord {
  status: IdempotencyStatus;
  endpoint: string;
  requestHash: string;
  responseCode: number | null;
  responseBody: unknown;
}

export interface IdempotencyRepository {
  begin(input: {
    userId: string;
    key: string;
    endpoint: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<{ created: true } | { created: false; existing: IdempotencyRecord }>;
  complete(userId: string, key: string, responseCode: number, responseBody: unknown): Promise<void>;
  fail(userId: string, key: string): Promise<void>;
}

export const IDEMPOTENCY_REPOSITORY = Symbol('IDEMPOTENCY_REPOSITORY');

@Injectable()
export class PgIdempotencyRepository implements IdempotencyRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async begin(input: { userId: string; key: string; endpoint: string; requestHash: string; expiresAt: Date }) {
    await this.db.query('DELETE FROM idn.idempotency_key WHERE user_id = $1 AND key = $2 AND expires_at < now()', [
      input.userId,
      input.key,
    ]);
    const inserted = await this.db.query(
      `INSERT INTO idn.idempotency_key (user_id, key, endpoint, request_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, 'In progress', $5)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [input.userId, input.key, input.endpoint, input.requestHash, input.expiresAt],
    );
    if (inserted.rowCount === 1) return { created: true as const };

    const { rows } = await this.db.query<{
      status: IdempotencyStatus;
      endpoint: string;
      request_hash: string;
      response_code: number | null;
      response_body: unknown;
    }>(
      'SELECT status, endpoint, request_hash, response_code, response_body FROM idn.idempotency_key WHERE user_id = $1 AND key = $2',
      [input.userId, input.key],
    );
    const row = rows[0];
    return {
      created: false as const,
      existing: {
        status: row.status,
        endpoint: row.endpoint,
        requestHash: row.request_hash,
        responseCode: row.response_code,
        responseBody: row.response_body,
      },
    };
  }

  async complete(userId: string, key: string, responseCode: number, responseBody: unknown) {
    await this.db.query(
      `UPDATE idn.idempotency_key SET status = 'Completed', response_code = $3, response_body = $4::jsonb
       WHERE user_id = $1 AND key = $2`,
      [userId, key, responseCode, JSON.stringify(responseBody ?? null)],
    );
  }

  async fail(userId: string, key: string) {
    await this.db.query("UPDATE idn.idempotency_key SET status = 'Failed' WHERE user_id = $1 AND key = $2", [
      userId,
      key,
    ]);
  }
}

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly rows = new Map<string, IdempotencyRecord>();

  async begin(input: { userId: string; key: string; endpoint: string; requestHash: string; expiresAt: Date }) {
    const id = `${input.userId}:${input.key}`;
    const existing = this.rows.get(id);
    if (existing) return { created: false as const, existing };
    this.rows.set(id, {
      status: 'In progress',
      endpoint: input.endpoint,
      requestHash: input.requestHash,
      responseCode: null,
      responseBody: null,
    });
    return { created: true as const };
  }

  async complete(userId: string, key: string, responseCode: number, responseBody: unknown) {
    const row = this.rows.get(`${userId}:${key}`);
    if (row) Object.assign(row, { status: 'Completed', responseCode, responseBody });
  }

  async fail(userId: string, key: string) {
    const row = this.rows.get(`${userId}:${key}`);
    if (row) row.status = 'Failed';
  }
}
