# Identity and access: assumptions behind backlog item 13

Source: architecture document sections 7.10, 7.11, 13.1 to 13.3 and 13.6; SRS section 3 (security alerts, login activity). Every value below is a code constant or environment variable and can change without a migration. **Review before the pilot.**

## Behaviour changes to notice

- A locked account now answers `401 INVALID_CREDENTIALS`, the same as a wrong password or an unknown number (architecture 13.1.2). The earlier `423 ACCOUNT_LOCKED` leaked the lock. The real owner learns about the lock through the NTF-EV-21 alert.
- Staff refresh tokens last 7 days (architecture 13.1), not 1 day; the portal refresh cookie follows.
- Every Android or iOS sign-in must send a device public key (`device.publicKey`, P-256 SPKI PEM). Refresh then needs a proof signed by that device. Generate a test key with `openssl ecparam -name prime256v1 -genkey -noout | openssl ec -pubout`.
- Grants are loaded for the active role only. A staff member who also holds Donor (OI-23) gets no staff permissions while signed in as a donor.
- `permission.manage`, `audit.export`, `donor.phone.export` and `donor.search.export` now really require a step-up within 5 minutes. The staff assignment endpoint therefore needs `POST /auth/step-up` first.
- The reject endpoint for requests declares its two alternative permissions (`blood_request.approve` or `blood_request.reject_moderation`); the service rules are unchanged.

## Values chosen

| Topic | Value | Where |
| --- | --- | --- |
| Access token lifetime | 15 minutes; issuer `JWT_ISSUER` (default `bbda`); audience `/api/v1`; clock skew 60 s | `platform/security/token.service.ts` |
| Key rotation | `JWT_PRIVATE_KEY_PATH` signs; `JWT_VERIFY_KEY_PATHS` (comma separated) keeps old public keys valid; `GET /auth/jwks` publishes them | same |
| Refresh lifetime | 30 days public, 7 days staff | `auth.support.ts` |
| Device proof | message `bbda:refresh:<refreshToken>:<timestamp>` or `bbda:step-up:<sessionId>:<timestamp>`, ES256, IEEE P1363 signature, base64url, timestamp within 5 minutes | `platform/security/device-proof.ts` |
| Step-up window | 5 minutes, stored in `idn.session.step_up_at`, copied to rotated sessions | `policy.types.ts` |
| Lockout | 5 failures; 15 minutes doubling to 24 hours; cleared by password reset | `auth.service.ts` |
| OTP limits | 3 per phone and purpose per 15 minutes; 10 per phone per day; 20 per IP per day; 5 attempts per challenge | `auth.support.ts` |
| Sign-in throttle | 20 failed attempts per IP in 15 minutes gives `429 LOGIN_RATE_LIMITED` | same |
| Reset token | 10 minutes, single use, stored hashed in `idn.password_reset` | `password-flow.service.ts` |
| Staff password history | current plus last 4 hashes cannot be reused; public users have no history | same |
| Security alerts | NTF-EV-21 to the user by in-app and push, SMS fallback after 5 minutes where consented | migration 0035, notification planner |

## Development-only switch

`DEV_SKIP_STAFF_SMS_CODE=true` skips the staff SMS second step so the portal can be demonstrated without reading codes from the log. `loadConfig` throws when it is set with `NODE_ENV` staging or production, and the api runtime logs a warning at start-up when it is on. It never affects public users, step-up or password reset.

## Simplifications that need a later item

- Throttles count rows in `idn.login_event` and `idn.otp_challenge`. Redis counters, per-ASN limits and device attestation are OI-33.
- Forgot password and SMS-code sign-in always answer `202 { accepted: true }`; when a number is rate limited nothing is sent and nothing is revealed.
- "This wasn't me" revokes every other session, revokes the reported device and publishes `SuspiciousSignInReported`. The Technical support ticket is created when the support module exists (backlog item 9).
- A staff password reset signs nobody in and clears the trusted-device marks, so the next sign-in repeats the 2-step flow. The Administrator alert for staff resets (NTF-EV-23) is not sent yet.
- `login_event` carries `NEW_DEVICE` and `MANY_FAILURES` risk flags. `NEW_REGION` and `IMPOSSIBLE_TRAVEL` need sign-in location capture (backlog item 15).
- The staff bound-device limit (default 2) is not enforced.
- The mobile route for the staff second step stays `POST /auth/staff/verify-code`; the architecture document calls it `mfa-verify`.
- Areas and facilities are readable by any signed-in user without a catalogue key; they are reference data and carry no personal data. If the owner wants a key, add `reference.view` to every base set.
- The realtime gateway authenticates the handshake and joins `user:<id>`; nothing is published to those rooms yet (backlog item 16).

## Verification

On 14 October 2026 all 35 migrations were applied to a fresh `bbda_dev` database on PostgreSQL 18 with PostGIS 3.6, and the full backend suite passed: 28 suites, 182 tests, including the rewritten integration suites for sign-in, refresh with device proof, password reset and change, SMS-code sign-in, sessions, step-up and the staff portal flow. The type check and the OpenAPI export pass too.
