"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../src/platform/db/database.service");
const partition_service_1 = require("../../src/platform/db/partition.service");
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('platform maintenance and guards (needs TEST_DATABASE_URL with all migrations applied)', () => {
    let db;
    beforeAll(() => {
        db = new database_service_1.DatabaseService({ databaseUrl: url });
    });
    afterAll(() => db.onModuleDestroy());
    it('creates future monthly partitions for every partitioned table and is idempotent', async () => {
        const partitions = new partition_service_1.PartitionService(db);
        const far = new Date(Date.UTC(2031, 0, 15));
        const first = await partitions.ensureAhead(2, far);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(await partitions.ensureAhead(2, far)).toBe(0);
        const parents = await db.query(`SELECT count(*)::int AS n FROM pg_partitioned_table WHERE partstrat = 'r'`);
        const made = await db.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname ~ '_2031_0[123]$' AND relkind = 'r'`);
        expect(made.rows[0].n).toBe(parents.rows[0].n * 3);
    });
    it('refuses to remove the last active Primary Administrator', async () => {
        const attempt = db.transaction(async (tx) => {
            const rows = await tx.query(`SELECT u.id FROM idn.user_permission_set u JOIN idn.permission_set s ON s.id = u.permission_set_id
          WHERE s.code = 'TIER_PRIMARY_ADMINISTRATOR' AND u.status = 'Active' ORDER BY u.id`);
            if (rows.rows.length === 0) {
                const user = await tx.query(`INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), true) RETURNING id`, [`+8801${Math.floor(Math.random() * 1e9)}`]);
                const ins = await tx.query(`INSERT INTO idn.user_permission_set (user_id, permission_set_id, status, effective_from) SELECT $1, id, 'Active', now() FROM idn.permission_set WHERE code = 'TIER_PRIMARY_ADMINISTRATOR' RETURNING id`, [user.rows[0].id]);
                rows.rows.push(ins.rows[0]);
            }
            for (const row of rows.rows) {
                await tx.query(`UPDATE idn.user_permission_set SET status = 'Revoked', revoked_at = now(), revoke_reason = 'test' WHERE id = $1`, [row.id]);
            }
            return (0, node_crypto_1.randomUUID)();
        });
        await expect(attempt).rejects.toThrow('last active Primary Administrator');
    });
});
//# sourceMappingURL=platform.spec.js.map