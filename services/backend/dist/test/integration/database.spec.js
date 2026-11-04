"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../src/platform/audit/audit.service");
const database_service_1 = require("../../src/platform/db/database.service");
const idempotency_repository_1 = require("../../src/platform/idempotency/idempotency.repository");
const event_bus_1 = require("../../src/platform/outbox/event-bus");
const outbox_relay_1 = require("../../src/platform/outbox/outbox.relay");
const outbox_service_1 = require("../../src/platform/outbox/outbox.service");
const status_history_service_1 = require("../../src/platform/status/status-history.service");
const audit_writer_1 = require("../../src/modules/audit/audit-writer");
const hash_chain_1 = require("../../src/modules/audit/hash-chain");
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('database integration (needs TEST_DATABASE_URL with all migrations applied)', () => {
    let db;
    const outbox = new outbox_service_1.OutboxService();
    beforeAll(() => {
        db = new database_service_1.DatabaseService({ databaseUrl: url });
    });
    afterAll(() => db.onModuleDestroy());
    it('stores an idempotency key once and returns the existing record on a retry', async () => {
        const repo = new idempotency_repository_1.PgIdempotencyRepository(db);
        const input = {
            userId: (0, node_crypto_1.randomUUID)(),
            key: (0, node_crypto_1.randomUUID)(),
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
        const event = { aggregateType: 'T', aggregateId: (0, node_crypto_1.randomUUID)(), eventType: 'Created', payload: { a: 1 } };
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
        const bus = new event_bus_1.EventBus();
        const writer = new audit_writer_1.AuditWriter(db, bus);
        writer.onModuleInit();
        const relay = new outbox_relay_1.OutboxRelay(db, bus);
        const history = new status_history_service_1.StatusHistoryService(new audit_service_1.AuditService(outbox));
        const requestId = (0, node_crypto_1.randomUUID)();
        await db.transaction((tx) => history.record(tx, {
            entityType: 'BLOOD_REQUEST',
            entityId: requestId,
            from: 'Draft',
            to: 'Submitted',
            actorUserId: null,
            actorRole: 'SYSTEM',
            source: 'SYSTEM',
            contextRequestId: requestId,
            correlationId: 'it-1',
        }));
        await expect(db.transaction((tx) => history.record(tx, {
            entityType: 'BLOOD_REQUEST',
            entityId: requestId,
            from: 'Submitted',
            to: 'Not a status',
            actorUserId: null,
            actorRole: 'SYSTEM',
            source: 'SYSTEM',
            correlationId: 'it-2',
        }))).rejects.toThrow();
        await expect(db.query('UPDATE aud.status_history SET reason = $1 WHERE entity_id = $2', ['x', requestId])).rejects.toThrow(/append-only/);
        while ((await relay.publishPending()) > 0) {
            /* drain */
        }
        const { rows } = await db.query('SELECT * FROM aud.audit_event ORDER BY chain_seq');
        expect(rows.some((r) => r.entity_id === requestId)).toBe(true);
        const verified = (0, hash_chain_1.verifyChain)(rows.map((r) => ({
            prevHash: r.prev_hash,
            hash: r.hash,
            record: (0, hash_chain_1.auditHashRecord)({
                occurredAt: r.occurred_at,
                category: r.category,
                action: r.action,
                result: r.result,
                actorUserId: r.actor_user_id,
                actorRole: r.actor_role,
                permissionUsed: r.permission_used,
                entityType: r.entity_type,
                entityId: r.entity_id,
                subjectUserId: r.subject_user_id,
                contextRequestId: r.context_request_id,
                fieldGroup: r.field_group,
                reasonCode: r.reason_code,
                reasonText: r.reason_text,
                changes: r.changes,
                correlationId: r.correlation_id,
                chainSeq: r.chain_seq,
            }),
        })));
        expect(verified).toBe(-1);
    });
});
//# sourceMappingURL=database.spec.js.map