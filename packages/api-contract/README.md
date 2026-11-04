# API contract

`openapi.json` is the API description, exported from the backend's code. It is the single source for the web and mobile clients. Do not edit it by hand.

## Regenerate after an API change

1. From `services/backend`, run `npm run openapi:export` with `DATABASE_URL` set to any PostgreSQL URL. The export builds the app without connecting to the database.
2. From `packages/api-client`, run `npm run generate`. This writes `src/schema.ts`.
3. Commit `openapi.json` and `src/schema.ts` together. Never change either file by hand.
