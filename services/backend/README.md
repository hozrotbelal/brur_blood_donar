# BBDA backend

NestJS 11 modular monolith. One codebase, three runtimes: `api`, `realtime`, `worker`.

## Run

```
npm ci --ignore-scripts
npm run build
npm test
export DATABASE_URL=postgres://...
npm run start:api
```

`GET /api/v1/health`, `GET /api/v1/openapi.json` and `GET /api/v1/auth/jwks` are served by the api runtime. Outside production, `GET /api/v1/docs` serves Swagger UI from the already-installed `swagger-ui-dist` files (no extra package). Never commit `.env`.

### Local database

With the PostgreSQL 18 + PostGIS bundle installed on this machine: create `bbda_dev`, apply `migrations/*.sql` in order with `psql -v ON_ERROR_STOP=1`, then load `seeds/sample-data.sql` (dev only). In development the SMS sender only logs, so OTP codes appear in the api runtime's log as `BBDA code: 123456`.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 16+ with PostGIS, migrations applied in order |
| `JWT_ISSUER` | `iss` claim, default `bbda`; every runtime must use the same value |
| `JWT_PRIVATE_KEY_PATH` | EC P-256 private key (PEM) that signs access tokens; required outside development |
| `JWT_VERIFY_KEY_PATHS` | Comma-separated PEM files of previous public keys kept valid during rotation; alone, the runtime verifies only (realtime) |
| `WEB_ORIGIN` | Staff portal origin for CORS and the browser sign-in flow (ADR-15) |
| `WEB_TRUSTED_BROWSER_DAYS` | 30 by default; 0 asks staff for an SMS code on every browser sign-in (OI-31) |
| `COOKIE_SECURE` | Defaults to true in staging and production |
| `IDEMPOTENCY_TTL_HOURS` | 24 by default |
| `DEV_SKIP_STAFF_SMS_CODE` | `true` lets staff sign in without the SMS second step; the server refuses to start with it outside development and test |

Generate a signing key with `openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out jwt-key.pem` and keep it in the secrets store, never in the repository. To rotate, start signing with a new file and list the old public key in `JWT_VERIFY_KEY_PATHS` until all tokens issued with it have expired (15 minutes).

### Tests

`npm test` runs the unit suites. The integration suites under `test/integration` run only when `TEST_DATABASE_URL` points at a database with every migration applied; they are skipped otherwise and say so.

## Layout

- `src/platform` shared pieces: config, db (`DatabaseService`, generated `enums.ts` and `schema.ts`, custom column types), policy (decision point, guards, step-up), security (JWT, device proofs), idempotency, outbox, audit, status history, http.
- `src/modules/<module>` one folder per module (identity, request, matching, case-workflow, support, notification, moderation, appointments, community, reporting, audit, configuration). Each has a generated `schema.ts` for its own tables, controllers, DTOs and services. Other modules may import only `<module>.public.ts`, never a `schema.ts`; `test/architecture` enforces both.
- `src/entrypoints` api, worker and realtime bootstraps; `export-openapi` writes `packages/api-contract/openapi.json`.
- `migrations` numbered SQL files, applied in order; `seeds/sample-data.sql` is a development-only script.
- `scripts/generate-schema.mjs` derives the Drizzle schema files from a migrated database.

## Data access (ADR-16)

Services use Drizzle ORM (`drizzle-orm` 0.45.4, no transitive dependencies) through `Db.orm`, which `DatabaseService` provides for the pool and for every transaction. The schema files are generated, not written:

```
export DATABASE_URL=postgres://...   # a database with every migration applied
npm run schema:generate              # rewrites src/**/schema.ts and src/platform/db/enums.ts
npm run schema:check                 # exits 1 when the files no longer match the database
```

Run `schema:generate` in the same pull request as any migration. Identity, request, configuration, appointments and the outbox are on the ORM; matching, case workflow and notification still use SQL through the same `Db` until backlog item 14 moves them. See `docs/architecture/database-guidelines.md` for when raw SQL stays.

## Implemented

- Identity: registration with OTP and password; sign-in with lockout, enumeration protection and per-IP throttle; SMS-code sign-in for public users; staff 2-step; forgot, reset and change password; device-bound rotating refresh tokens; sessions, device sign-out, login activity and "This wasn't me"; step-up by device key or SMS code; staff invitations and assignments; donor profile, availability, locations, consents and preferences; browser sign-in for the staff portal.
- Policy: scope-aware permission decisions (Own, Assigned, Area, All), step-up enforcement for sensitive keys, alternative permissions per endpoint, audit of denied attempts.
- Request, matching, case workflow and notification flows for Phase 1 (see each module README and `docs/decisions`).
- Idempotency: `Idempotency-Key` required on POST, PUT, PATCH and DELETE except the credential endpoints; replay, 422 on a changed body, 409 while in progress.
- Outbox: transactional append, SKIP LOCKED relay, in-process event bus. Audit entries are validated, written through the outbox and hash-chained by AUD.
- Reference data: `GET /areas` and `GET /facilities`.
- Realtime: handshake authenticated with the access token; clients join `user:<id>`.

## Not implemented yet

Account recovery requests, phone number change, unlock endpoints, sign-in location risk flags, support tickets and chat, moderation, configuration administration, reporting, audit read endpoints, donor map and search, realtime fan-out, the Flutter app. See `docs/backlog.md`.
