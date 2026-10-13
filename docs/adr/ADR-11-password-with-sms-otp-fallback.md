# ADR-11 Password with SMS OTP fallback and staff 2-step

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

The client decided (Addendum A1, 25 September 2026) that all five roles sign in with a password and can use Forgot password, keeping SMS OTP as the fallback. This supersedes the earlier OTP-only sign-in assumption of version 1.0. SMS OTP alone is exposed to SIM swap and SMS cost; passwords alone are exposed to credential stuffing.

## Decision

Phone number and password for all roles, stored as Argon2id hashes under an NIST SP 800-63B style policy with a breached-password blocklist; SMS OTP for registration, password reset, recovery, number change and public fallback sign-in; staff always use password plus OTP on a new device and at least every 30 days per device, and can never sign in with OTP alone; lockout, rate limits, enumeration protection and NTF-EV-21 security alerts; the token, device-binding and local biometric unlock design is unchanged.

## Alternatives

OTP-only sign-in (superseded: SMS dependency, cost and SIM swap exposure); password only without OTP fallback (rejected: users who forget passwords would be locked out); authenticator-app TOTP for staff (possible future option).

## Consequences

New tables credential, password_history, password_reset, account_recovery_request and staff_invitation; CPU cost of hashing on the API pods; account recovery needs a Support review queue and cooling-off; fewer SMS for routine sign-in.
