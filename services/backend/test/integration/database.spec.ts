import { randomUUID } from 'node:crypto';
import { AuditService } from '../../src/platform/audit/audit.service';
import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { PgIdempotencyRepository } from '../../src/platform/idempotency/idempotency.repository';
import { EventBus } from '../../src/platform/outbox/event-bus';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { StatusHistoryService } from '../../src/platform/status/status-history.service';
import { AuditWriter } from '../../src/modules/audit/audit-writer';
import { auditHashRecord, verifyChain } from '../../src/modules/audit/hash-chain';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('database integration (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  const outbox = new OutboxService();

  beforeAll(() => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
  });
  afterAll(() => db.onModuleDestroy());

  it('stores an idempotency key once and returns the existing record on a retry', async () => {
    const repo = new PgIdempotencyRepository(db);
    const input = {
      userId: randomUUID(),
      key: randomUUID(),
      endpoint: 'POST /x',
      requestHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
    };
    expect(await repo.begin(input)).toEqual({ created: true });
    const second = await repo.begin(input);
    expect(second.created).toBe(false);
    await repo.complete(input.userId, input.key, 201, { ok: true });
    const third = await repo.begin(input);
    expect(third.created === false && third.existing.status).toBe('Completed');
  });

  it('dedupes outbox events on the dedupe key', async () => {
    const event = { aggregateType: 'T', aggregateId: randomUUID(), eventType: 'Created', payload: { a: 1 } };
    await db.transaction(async (tx) => {
      await outbox.append(tx, event);
      await outbox.append(tx, event);
    });
    const { rows } = await db.query('SELECT count(*)::int AS n FROM platform.outbox_event WHERE aggregate_id = $1', [
      event.aggregateId,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it('writes status history with an audit event that reaches the hash chain, and refuses updates', async () => {
    const bus = new EventBus();
    const writer = new AuditWriter(db, bus);
    writer.onModuleInit();
    const relay = new OutboxRelay(db, bus);
    const history = new StatusHistoryService(new AuditService(outbox));
    const requestId = randomUUID();

    await db.transaction((tx) =>
      history.record(tx, {
        entityType: 'BLOOD_REQUEST',
        entityId: requestId,
        from: 'Draft',
        to: 'Submitted',
        actorUserId: null,
        actorRole: 'SYSTEM',
        source: 'SYSTEM',
        contextRequestId: requestId,
        correlationId: 'it-1',
      }),
    );
    await expect(
      db.transaction((tx) =>
        history.record(tx, {
          entityType: 'BLOOD_REQUEST',
          entityId: requestId,
          from: 'Submitted',
          to: 'Not a status',
          actorUserId: null,
          actorRole: 'SYSTEM',
          source: 'SYSTEM',
          correlationId: 'it-2',
        }),
      ),
    ).rejects.toThrow();
    await expect(db.query('UPDATE aud.status_history SET reason = $1 WHERE entity_id = $2', ['x', requestId])).rejects.toThrow(
      /append-only/,
    );

    while ((await relay.publishPending()) > 0) {
      /* drain */
    }
    const { rows } = await db.query<Record<string, unknown> & { prev_hash: Buffer; hash: Buffer }>(
      'SELECT * FROM aud.audit_event ORDER BY chain_seq',
    );
    expect(rows.some((r) => r.entity_id === requestId)).toBe(true);
    const verified = verifyChain(
      rows.map((r) => ({
        prevHash: r.prev_hash,
        hash: r.hash,
        record: auditHashRecord({
          occurredAt: r.occurred_at as Date,
          category: r.category as string,
          action: r.action as string,
          result: r.result as string,
          actorUserId: r.actor_user_id as string | null,
          actorRole: r.actor_role as string,
          permissionUsed: r.permission_used as string | null,
          entityType: r.entity_type as string | null,
          entityId: r.entity_id as string | null,
          subjectUserId: r.subject_user_id as string | null,
          contextRequestId: r.context_request_id as string | null,
          fieldGroup: r.field_group as string | null,
          reasonCode: r.reason_code as string | null,
          reasonText: r.reason_text as string | null,
          changes: r.changes,
          correlationId: r.correlation_id as string,
          chainSeq: r.chain_seq as string,
        }),
      })),
    );
    expect(verified).toBe(-1);
  });
});
