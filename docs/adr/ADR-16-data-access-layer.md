# ADR-16 Typed data access with Drizzle ORM over SQL migrations

Status: Accepted on 14 October 2026 by the project owner ("add the ORM"); package `drizzle-orm` 0.45.4 installed with scripts disabled the same day.

## Context

The backend used the `pg` driver with hand-written SQL in every service (about 7,400 lines) and 35 SQL migration files. The schema relies on PostgreSQL features that object-relational mappers handle badly or not at all: one schema per module, PostGIS `geography` columns, monthly range partitions, append-only triggers, check constraints, plpgsql guard functions and views such as `idn.v_effective_permission`. The source documents do not name a data-access library; OI-22 only fixed NestJS.

The project owner asked for an ORM. The repository has had a malware incident, so a new dependency must be small, script-free and from a known publisher, and must be installed with `--ignore-scripts`.

## Decision

1. The SQL migrations stay the only source of truth for the schema. No tool generates or runs migrations; expand-and-contract stays as it is.
2. **Drizzle ORM** (`drizzle-orm`, npm, MIT, published by the Drizzle Team, `drizzle-team/drizzle-orm` on GitHub; zero runtime dependencies, no install scripts) is the typed data-access layer. It runs on the existing `pg` Pool, understands PostgreSQL schemas, enums and arrays, and falls back to its `sql` tag for PostGIS, partitions and row locks.
3. Each module owns a generated `src/modules/<module>/schema.ts` describing its tables; enums live in `src/platform/db/enums.ts`, the platform tables in `src/platform/db/schema.ts`. The files are produced by `scripts/generate-schema.mjs` from a migrated database (`npm run schema:generate`) and never edited by hand; `npm run schema:check` fails when they drift from the database. A migration pull request regenerates them in the same change.
4. `DatabaseService` exposes one Drizzle instance per pool and one per transaction (`Db.orm`) next to the raw `Db.query`, so ORM and SQL calls share a transaction while the migration of modules continues.
5. Modules never import another module's schema file or the platform schema; cross-module reads stay on the owner's public interface or on documented SQL fragments. `test/architecture` enforces this.
6. Raw SQL remains allowed, and is documented in the service, for: PostGIS expressions, `SKIP LOCKED` worker loops, partition maintenance, the audit hash chain, platform tables that live in another module's PostgreSQL schema (`idn.idempotency_key`, `aud.status_history`, `aud.audit_event`), and cross-module reads where importing the other module's schema would break a boundary.
7. `drizzle-kit` is not added.

## Adoption status (14 October 2026)

| Area | State |
| --- | --- |
| Schema files for all 12 modules and the platform (88 tables, 135 enums) | Generated, checked by `schema:check` |
| Identity (auth, sessions, password flows, staff, donor profile, donation projector) | On the ORM |
| Request (patients, requests, review queue, flags, outreach pause) | On the ORM |
| Configuration (areas), Appointments (facilities), platform outbox | On the ORM |
| Notification (enqueue, inbox, delivery report, dispatcher decisions and attempts) | On the ORM; identity, request and case data through their `read-model.public.ts`; the two dispatcher `SKIP LOCKED` loops and the event planner (cross-module recipient reads) stay SQL by rule 6 |
| Matching (waves, candidates, invitations, responses) | On the ORM; request status changes, batch review tasks and donor last-response go through the owning module's public functions; donor facts (PostGIS), the request lock with location, the request scans and the three invitation `SKIP LOCKED` loops stay SQL by rule 6 |
| Case workflow (cases, donors, appointments, tasks, notes, contacts, outcomes, disputes) | On the ORM; request status changes go through the request module's public functions and invitation cancellation through matching's; the donor appointment list (PostGIS facility coordinates) and the ended-request scan stay SQL by rule 6 |
| Platform idempotency, status history, audit writer, partitions, area scope | SQL by rule 6 |

## Alternatives

- **TypeORM.** Large dependency tree, decorator entities that fight the one-schema-per-module layout, weak support for partitions and PostGIS. Rejected.
- **MikroORM.** Unit-of-work mapper with many transitive dependencies; identity-map semantics add risk in the outbox and idempotency code paths. Rejected for Phase 1.
- **Prisma.** Needs generated engines and a generator step at install time, which conflicts with the `--ignore-scripts` rule; its migration tool would compete with the SQL migrations. Rejected.
- **Kysely.** Zero-dependency typed query builder; technically close but not an ORM, so it does not meet the request as stated.
- **Stay on raw SQL.** Worked and was fully tested, but column names were strings and result rows untyped.

## Consequences

- One runtime dependency, pinned exactly, installed with `npm install drizzle-orm@0.45.4 --ignore-scripts`. Drizzle emits a schema-qualified table name in `FOR UPDATE OF`, which PostgreSQL rejects, so services lock the joined rows instead of naming one table.
- `schema.ts` files change whenever a migration changes a table. The integration suites and `schema:check` are the safety net; the owner's PostgreSQL 18 with PostGIS runs them (OI-34).
- Unit tests that asserted SQL strings now run the ORM against a fake client (`test/fake-db.ts`).
- TypeScript stays at 5.9.3 because ts-jest cannot drive the TypeScript 7 native compiler; the earlier unreviewed bump to 7.0.2 was reverted.
