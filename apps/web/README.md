# BBDA staff web portal

Next.js (App Router) with TypeScript, for the Support, Moderation and Administrator roles. Decision: [ADR-15](../../docs/adr/ADR-15-staff-web-portal.md). Donors, patients and representatives also use the web (ADR-15, Amendment 1); their screens are not built yet.

## Run locally

1. Start the backend API so it listens on the address in `BBDA_API_URL` (default `http://127.0.0.1:3000`).
2. Set `WEB_ORIGIN` on the backend to the portal's address (for example `http://localhost:3001`).
3. From `apps/web`, run `npm run dev -- -p 3001`.

The portal calls `/api/v1/...` on its own origin. `next.config.mjs` proxies those calls to the backend. This keeps the browser on one site, so the `SameSite=Strict` cookies work.

## Checks

- `npm run typecheck`: TypeScript, strict mode.
- `npm run i18n:check`: every English message has a Bangla message, and no Bangla message is empty. The build runs this first.
- `npm run build`: production build.

## Layout

- `src/app/(staff)`: every signed-in screen, wrapped by the staff shell (top bar, role menu, language switch). The route group does not change the URL.
- `src/app/sign-in`: staff sign-in with the SMS step, using the public header.
- `src/components/staff-shell.tsx`: role-based navigation from `src/lib/staff-nav.ts`, which follows the BBDA prototype menus for Support, Moderation and Organization Admin.
- `src/components/work-queue.tsx`: Support queue (requests and coordination cases).
- `src/components/request-detail.tsx`: request verification: pick up, checklist, verify, ask for information, reject, resolve flags.
- `src/components/invitations-screen.tsx`: staff invitations (Organization Admin).
- `src/components/planned-screen.tsx`: placeholder for menu items whose screens are not built yet (`/planned?screen=<menu key>`).
- `src/lib/api.ts`: access token and role kept in memory; `restoreSession()` rebuilds them from the httpOnly refresh cookie after a page reload.
- `src/lib/staff-data.ts`: typed calls for the review, verification and invitation endpoints. Every POST sends an `Idempotency-Key`.
- `src/app/globals.css`: colour tokens and layout taken from the BBDA prototype (brand `#9b0e16`), with dark mode from the system setting.
- `src/lib/messages.ts`, `messages/en.json`, `messages/bn.json`: all user-visible text. Run `npm run i18n:check` after adding a key.

## Public users on the web (ADR-15 Amendment 1)

- `src/app/(public)`: donor and patient/representative screens, using the same shell as staff (`components/role-shell.tsx`) with their own menu (`lib/public-nav.ts`).
- Built: home, my requests (list, status with milestones and timeline, submit a draft), new request (with adding a patient first), donor invitations (answer Available, Later or Unavailable), appointments, notifications, profile (donor details, patient list), consent (change choices).
- Patient request flow: `/home` (active request), `/requests/new` (also edits a draft with `?draft=<id>`), `/requests/drafts`, `/requests` (history), `/requests/update`, `/requests/cancel`, `/requests/<id>`. Demo data for the patient account comes from `services/backend/seeds/patient-flow-demo.sql` (development only). Requisition upload is shown but not available until the document service exists.
- Not built yet (menu items point to the planned page): tickets and chat, callbacks, representatives, change password and number, export and delete, donation history, collection locations, and the rest of the planned items in the menu.
- Session: the sign-in page sends donors and patients to `/home`, staff to `/queue`. A user who opens the other area is sent to their own home.
- Open issue OI-35 still applies: web sessions for public users have no device key, so the web is not for release until it is decided.

## Built so far

- Sign-in, session restore, shell and role menus.
- Support work queue and request verification (backlog item 5, part).
- Organization Admin: staff invitations list, invite and revoke (backlog item 6, part).

## Not yet built

- Support: coordination case screens, outcomes, escalations, account recovery review, waves and batch approval, donor map, conversations (backlog item 5).
- Organization Admin: staff list, assignment changes, roles, configuration, templates, reports (backlog items 6 and 7).
- Moderation and community screens (backlog item 8).
- Step-up in the browser: sensitive actions answer `403 STEP_UP_REQUIRED`; the portal must call `POST /api/v1/auth/step-up/challenge` and then `POST /api/v1/auth/step-up` before retrying.

The typed API client lives in `packages/api-client` and is regenerated from `packages/api-contract/openapi.json` (see that package's README).

The design reference is the BBDA prototype artifact (Role Prototype). Screens that are still placeholders are listed in the navigation with the planned label.
