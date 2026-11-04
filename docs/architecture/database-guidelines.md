# Database guidelines

Source: 04 ERD and Data Model; 03 System Architecture Document, Sections 11 and 14; ADR-16.

- PostgreSQL 16 or later with PostGIS. One schema per module; no cross-schema writes.
- Unique constraints and transactions implement exactly-once effects (ADR-03).
- Migrations are numbered SQL files in `services/backend/migrations`, applied in order. They use expand-and-contract and stay backward compatible. Test restores in staging.
- Donor location is stored twice: an exact point that is Restricted and encrypted, and an approximate point snapped to a grid of about 1 km. Matching and maps use only the approximate point (ADR-06).
- Every stateful entity writes the generic `status_history`. The `audit_event` table is append-only and hash-chained.
- Sensitive fields follow the data classification in document 04 (field-level encryption, masking).
- Retention periods are proposed and must be confirmed by the Organization (OI-08, OI-21).
- Synthetic seed data only outside production.

## Data access (ADR-16)

- Services read and write through Drizzle ORM using their module's generated `schema.ts`. `Db.orm` is the ORM handle for the pool or for the current transaction; `Db.query` is the raw driver for the cases below.
- `schema.ts`, `platform/db/enums.ts` and `platform/db/schema.ts` are generated from a migrated database by `npm run schema:generate` and must never be edited by hand. A pull request that adds a migration regenerates them; `npm run schema:check` (run with `DATABASE_URL` set) fails when they drift.
- A module imports only its own `schema.ts`. Reading another module's table goes through that module's public interface, or through a documented SQL fragment when no interface exists yet.
- Raw SQL is still right for PostGIS expressions, `FOR UPDATE ... SKIP LOCKED` worker loops, partition maintenance, the audit hash chain, and the platform tables that live in `idn` and `aud` (`idempotency_key`, `status_history`, `audit_event`). Say why in the service when you use it.
- Row locks: write `.for('update')` or `.for('no key update')` without an `of` target; Drizzle qualifies the target with its schema, which PostgreSQL rejects.
- Dates: `date` columns are strings (`YYYY-MM-DD`), `timestamptz` columns are `Date` objects, `numeric` columns are strings.
