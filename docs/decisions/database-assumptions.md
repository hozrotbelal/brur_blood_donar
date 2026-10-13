# Database migrations: how they were derived and what is assumed

Source: document 04 (ERD and Data Model), section 5 (data dictionary), section 6 (enumerations), section 7 (constraints and indexes) and section 14 (sample DDL). Migrations `0002` to `0021` were generated from those sections by a script and then applied to a scratch PostgreSQL 16 database with no errors. The sample DDL in section 14 is abbreviated, so section 5 was the column authority and section 14 supplied defaults and CHECK constraints.

## What was tested and what was not

- Applied cleanly in order on PostgreSQL 16: 87 tables, 391 indexes, 60 monthly partitions, 219 foreign keys.
- Rule tests: invalid status label refused, `status_history` and `audit_event` updates refused, `SENSITIVE_READ` audit row without reason refused, duplicate role refused.
- **Not tested: PostGIS.** The scratch server had no PostGIS, so `geography` columns were swapped for `bytea` during testing. The real files keep `geography(Point,4326)`. Migration `0020` (GiST indexes and `idn.reveal_exact_location`) was not run at all. Apply on your PostgreSQL 18 with PostGIS and report any error text.
- The integration test `test/integration/database.spec.ts` ran against the scratch database (idempotency, outbox dedupe, status history plus audit hash chain verified from stored rows). It is skipped unless `TEST_DATABASE_URL` is set.

## Decisions I made that you should confirm

1. **Schema ownership follows the "Owner:" line of each dictionary entry**, mapped to module codes: Identity and Access and Profile and Consent to `idn`; Request to `req` (so `patient` and `representative_link` are in `req`, although the module brief for IDN lists them); Matching to `src`; Case Workflow to `crd` (including `post_donation_checkin` and `escalation`); Messaging and Support to `sup`; Notification to `ntf`; Moderation to `mod`; Appointments and Campaigns to `apt` (including `facility`); Community to `com`; Reporting to `rpt`; Audit to `aud` (including `status_history`, `data_export`, `legal_hold`); Configuration to `cfg` (including `area`); `outbox_event` and `job_run` to `platform`; `search_event` to `src`.
2. **Enum types live in `public`**, as in the sample DDL.
3. **Foreign keys** were inferred from the dictionary "Key" column and the description. Columns the dictionary calls soft references (audit, status history, search results) have no foreign key. Foreign keys use the default action, which is restrict.
4. **`idn.idempotency_key.user_id` has no foreign key.** The dictionary makes it a foreign key, but sign-up and sign-in calls have no user yet. Anonymous calls use the nil UUID `00000000-0000-0000-0000-000000000000`.
5. **`data_export.search_event_id` is not a foreign key**, because `search_event` is partitioned and its primary key includes the time column.
6. **Columns hidden in descriptions were added:** `blood_request.outreach_paused_reason`, `outreach_paused_by`, `outreach_paused_at` (the description says "with reason, by, at" and a CHECK needs the reason) and `donor_profile.blood_group_verified_at` (needed by a CHECK in section 14).
7. **Nullability:** "No" means NOT NULL. A dash means nullable unless the description says "x not null". So some columns the dictionary does not mark clearly (for example `request_document.uploaded_by`) are nullable.
8. **Defaults:** booleans default to false; counters default to 0; the first lifecycle value is the default status for workflow tables (for example `Open`, `Pending`, `Draft`); section 14 defaults are copied as written.
9. **Partitioning:** `audit_event`, `status_history`, `login_event` and `search_event` are partitioned by month, with partitions created for 2026-10 to 2027-12. Inserts after December 2027 fail until a worker job calls `platform.ensure_month_partition(parent, month_start)`. That job is not written yet.
10. **Append-only triggers** (updates and deletes refused) are on `audit_event`, `status_history`, `login_event`, `outcome_update`, `case_note`, `moderation_action`, `invitation_response`, `contact_attempt` and `password_history`. Other "A" tables are updated in normal operation, so they have none.
11. **Extra unique indexes** from "unique pair" notes: `message_template (code, language)`, `notification_rule (event_code, recipient_role)`, `notification_template (event_code, channel)`.
12. **Role seed:** the five roles are inserted by `0021`. The Bangla names are my wording and need a native-speaker review.

## Not done, and why

- **Database roles and column privileges** (the application role must not read `donor_location.exact_point`, `login_event.location` or secret hash columns). This is a permission change, which `CLAUDE.md` says needs human approval. Please decide the role names first.
- **Allowed-transition tables and triggers** on `blood_request` and `coordination_case` (second line of defence in section 7.2). The state machines are enforced in the service for now.
- **Triggers for staff-role grants, the last Primary Administrator, and second approval of sensitive sets.** These are service rules for the moment.
- **Seed data beyond roles:** permission catalogue and sets, notification templates and rules, SLA policies, areas and facilities (section 15).
