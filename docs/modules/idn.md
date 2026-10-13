# Module brief: Identity, Access, Profile and Consent (IDN)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.2 Identity & Access (IDN)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Self-service registration for Donor and Patient or Patient Representative (SMS OTP proves number ownership, then password creation); staff activation by ADM invitation (OTP, password, device binding, step-up set-up; invitation valid 72 hours); sign-in with phone number and password; SMS-code fallback sign-in for public users; staff 2-step sign-in (password plus OTP on a new device and at least every 30 days per device); password policy, Argon2id hashing and staff password history; Forgot password and change password; lockout and rate limiting; enumeration protection; account recovery requests (Support review, ADM approval for staff, 72-hour cooling-off); phone number change; device binding, sessions, access and refresh tokens, device and session management; role assignment (staff roles by ADM only); role switcher for DON and PAT on one account; permission scopes; step-up for sensitive staff actions; account suspension and deletion requests; policy decision point (Section 13.2) combining role, tier, permission sets, scope, assignment and area; permission sets and tiers, grants with second approval and expiry; time-limited reveal grants for phones and exact locations; login telemetry (login_event, device history, risk flags, suspicious sign-in alerts) |
| Owned entities | app_user, role, user_role, permission_scope, device, otp_challenge, session, credential, password_history, password_reset, account_recovery_request, staff_invitation, permission, permission_set, permission_set_item, user_permission_set, sensitive_access_grant, login_event |
| Public APIs | /auth (register, verify-otp, set-password, login, login-otp, mfa-verify, refresh, logout, step-up, password/forgot, password/reset, password/change, recovery-requests, phone-change, sessions); /me (roles, active role, devices); /admin/team (invite staff, assign or revoke roles and scopes, suspend, unlock); /admin/recovery-requests (review, approve, reject); /permissions (catalogue, permission sets and tiers, user grants, approvals, my permissions, reveals); /security/login-activity (own sign-ins and devices, sign out a device, This wasn't me; scoped staff view of other users) |
| Events published | UserRegistered, StaffActivated, RoleAssigned, RoleRevoked, DeviceBound, SignedInNewDevice, AccountLocked, AccountUnlocked, PasswordChanged, PasswordReset, SessionsRevoked, RecoveryRequested, RecoveryDecided, RecoveryCompleted, PhoneNumberChanged, AccountSuspended, SuspiciousSignIn, PermissionGranted, PermissionRevoked, GrantApprovalRequested, RevealGranted |
| Events consumed | ModerationDecided (SUSPEND_ACCOUNT, BAN, MERGE_DUPLICATE) |
| Phase | Phase 1 (P1-I1); permission scopes for SUP used from Phase 2 |


## 5.3 Profile & Consent (IDN)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Donor profile (blood group and verification status Self-declared, Document-checked or Service-confirmed; general area; contact hours; travel radius; languages); availability for routine and urgent requests; consent capture and history; notification preferences; patient records and representative links; donation records, provisional next contact date (outreach-timing estimate), donor card and QR token, certificates, post-donation check-ins; donor location (donor_location: shared with LOCATION_USE consent, picked manually, or recorded by Support from a call; statuses Pending, Approved, Superseded, Rejected; exact point encrypted and approximate grid point); consent types including LOGIN_LOCATION and CHANNEL_CALL |
| Owned entities | donor_profile, donor_availability, donor_location, donation_record, donor_restriction, donor_card, certificate, post_donation_checkin, consent_record, notification_preference, patient, representative_link |
| Public APIs | /profiles/donor; /profiles/donor/availability; /profiles/donor/location (propose, confirm, history); /consents; /notification-preferences; /patients; /representative-links; /donations; /donor-card; /certificates; /checkins |
| Events published | ConsentChanged, ConsentWithdrawn, AvailabilityChanged, DonorLocationApproved, BloodGroupVerified, NextContactDateReached, CheckInDue |
| Events consumed | OutcomeRecorded (creates or confirms donation_record), ModerationDecided |
| Phase | Phase 1; donor card QR, certificates and check-ins Phase 1 basic, venue QR check-in Phase 2 |
