# Batch 2 and 3 assumptions

## Disputes
- Only the `is_disputed` flag on `crd.outcome_update` can change; every other column stays append-only (migration 0029).
- A disputed outcome stops counting towards fulfilment and blocks closing the case until resolved.
- A corrected outcome supersedes the disputed one; the original stays on record.

## Outreach pause
- Pausing holds queued invitations; it does not cancel them. Resume releases them.
- Already-sent invitations stay open for the donor to answer.

## "Later" re-ask
- One re-ask per invitation (`reask_count <= 1`), after the donor's chosen time, with a fresh response window.
- Skipped when the request is paused, held, closed or past its needed-by time, or the donor is no longer Active.
- Not yet checked: the donor's own availability pause (`paused_until`).

## Duplicate and suspicious requests
- Flags never block submission; they block verification until a reviewer dismisses or confirms each one.
- Rules: same patient or contact phone with the same blood group and component in the last 14 days; 3 or more submissions by one user in 24 hours; one contact phone across 3 or more patients in 7 days.
- The thresholds are code constants (`request-flags.ts`) and need confirmation.

## Staff invitation
- The invitation code goes out by SMS and is valid for 7 days; a new invitation to the same phone revokes the previous one.
- Only a holder of an administrator tier at the same or higher rank can grant an administrator tier. Support and moderation tiers can be granted by any administrator.
- `idn.check_grantor` now applies only to administrator tiers (migration 0031).
- Changing an assignment revokes the staff member's sessions. The step-up requirement on `permission.manage` is enforced by the policy guard since backlog item 13: the administrator must complete `POST /auth/step-up` within the last 5 minutes.

## Platform
- The worker creates monthly partitions six months ahead once a day.
- Migration 0032 stops the last active Primary Administrator from being removed.
- `seeds/sample-data.sql` holds sample areas, facilities and placeholder SLA targets, marked SAMPLE. It is a dev script, not a migration.
- Database roles and column privileges are not done: they need role names and approval first.
