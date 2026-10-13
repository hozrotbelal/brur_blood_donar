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

`GET /api/v1/health` and `GET /api/v1/openapi.json` are served by the api runtime. Never commit `.env`.

## Layout

- `src/platform` shared pieces: config, db, policy, idempotency, outbox, audit, status history, http.
- `src/modules/<module>` one folder per module (identity, request, matching, case-workflow, support, notification, moderation, appointments, community, reporting, audit, configuration). Other modules may import only `<module>.public.ts`; `test/architecture` enforces it.
- `src/entrypoints` api, worker and realtime bootstraps.

## Implemented

- Policy: scope-aware permission decisions (Own, Assigned, Area, All) and a guard.
- Idempotency: `Idempotency-Key` required on POST, PUT, PATCH and DELETE; replay, 422 on a changed body, 409 while in progress.
- Outbox: transactional append, SKIP LOCKED relay, in-process event bus.
- Audit: entries validated, then written through the outbox; AUD writes a SHA-256 hash chain.
- Status history and a declarative state machine; the request transition table from architecture 10.1.
- Argon2id password hashing.

## Not implemented yet

Sign-in and token verification (realtime refuses every connection until it exists), module business logic, the full database schema, and the Flutter app.

## Assumed database objects

`idn.idempotency_key`, `platform.outbox_event`, `platform.status_history` and `aud.audit_event`. Names and schemas follow data model 5.12 and 14.8 and still need migrations.
