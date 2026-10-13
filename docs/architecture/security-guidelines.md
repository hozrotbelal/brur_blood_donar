# Security guidelines

Source: 03 System Architecture Document, Section 13; ADR-06, ADR-08, ADR-11, ADR-12, ADR-13, ADR-14.

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
