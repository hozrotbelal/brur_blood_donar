# Testing strategy

Source: 01 BRD Section 13.1 (P1-I6); 02 SRS Section 13; 03 System Architecture Document Section 15.3.

- Unit tests for all business logic; API tests per endpoint; contract tests against OpenAPI.
- Architecture tests that fail the build on cross-module imports.
- Mobile unit, widget and integration tests; accessibility and localisation checks; missing Bangla strings fail the build.
- End-to-end scenarios (P1-I6): withdrawal, no-show, cancellation, failed delivery, offline reconnection with "Pending sync", forgot password, lockout, account recovery, suspicious sign-in, reveal limits, denied-permission attempts.
- Retry tests must show no duplicate invitations, cases or SMS.
- Permission matrix tests for all five roles and tiers.
- Staging uses synthetic data and an SMS sandbox only.
