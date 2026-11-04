# Security guidelines

Source: 03 System Architecture Document, Section 13; ADR-06, ADR-08, ADR-11, ADR-12, ADR-13, ADR-14, ADR-15.

- Phone number and password for all roles. Passwords hashed with Argon2id under a documented policy and breached-password blocklist.
- SMS OTP for registration, password reset, recovery, number change and public fallback sign-in. Staff always use password plus OTP on a new device and at least every 30 days per device.
- Lockout, rate limiting and enumeration protection. Defaults (minimum length 8, staff 10; five failures, 15 minutes; 72-hour recovery cooling-off) are proposed and confirmed through OI-13.
- Authorization: one policy decision point combining role, tier, permission sets, scope, assignment, area, record state, consent and reveal grants. No self-grants; second Administrator approval for sensitive grants.
- Reveal grants for donor phone and exact location are time-limited, reasoned, step-up protected, capped per day and audited; alert on high volume.
- Append-only, hash-chained audit for authentication, data changes, status changes, sensitive reads, search, export, location and permissions, including denied attempts.
- Secrets live only in CI and cloud secret stores. Never in the repository.
- Align with OWASP guidance; keep the STRIDE threat model current when features change.
- Privacy by design: consent, data minimisation, purpose limitation, access transparency for donors.
- Repository and tooling safety: `docs/security/malware-prevention-checklist.md`.

## Tokens and sessions as implemented

Code: `services/backend/src/platform/security` and `src/modules/identity`. Assumptions: `docs/decisions/identity-assumptions.md`.

- **Access token.** ES256 JWT, 15 minutes, claims `iss` (`JWT_ISSUER`), `aud` `/api/v1`, `sub`, `sid` (session), `role` (active role), `iat`, `nbf`, `exp`, header `kid`. Verification rejects any other algorithm, an unknown `kid`, another issuer or audience, and tokens from more than 60 seconds in the future. Every request also checks that the session is unrevoked, unexpired, belongs to the user, carries the same active role, and that the account and device are active.
- **Signing keys.** `JWT_PRIVATE_KEY_PATH` is the active EC P-256 key. `JWT_VERIFY_KEY_PATHS` lists previous public keys so tokens signed before a rotation stay valid until they expire. `GET /api/v1/auth/jwks` publishes the key set for gateway pre-validation. Runtimes without a private key (realtime) verify only.
- **Refresh token.** Opaque, 32 random bytes, stored as a SHA-256 hash, rotated on every use, 30 days for public roles and 7 days for staff. Reuse of a rotated token revokes every session on that device. Refresh fails for suspended or deleted accounts and for signed-out devices.
- **Device binding.** Mobile devices register a P-256 public key when a session opens. Refresh and step-up calls carry a proof signed with the device private key over `bbda:<kind>:<subject>:<timestamp>`; the timestamp must be within 5 minutes. Browser sessions (ADR-15) have no device key and use the httpOnly cookie, origin check and CSRF token instead.
- **Grants.** Loaded per request from the permission catalogue for the active role only: the role's base set plus the user's active tier sets for that role, each key filtered by `allowed_roles`. A person holding Donor and Patient never carries the other role's grants.
- **Step-up.** Permissions flagged `requires_step_up` in the catalogue need a step-up proof within the last 5 minutes on the current session: a device-key signature after biometric or PIN unlock on mobile, or a fresh SMS code (`POST /auth/step-up/challenge`, then `POST /auth/step-up`) in the browser. The policy guard answers `403 STEP_UP_REQUIRED` so clients can prompt.
- **Denied attempts** are audited as `PERMISSION_DENIED` with the permission key and the endpoint.
- **Credential endpoints** (`/auth/*`, `/web/auth/*`) never store their responses in the idempotency table because they contain tokens; single-use challenges and reset tokens prevent replays instead.
- **Security alerts** (NTF-EV-21) go out on password change or reset, sign-in from a new device, account lock and a reported suspicious sign-in.
