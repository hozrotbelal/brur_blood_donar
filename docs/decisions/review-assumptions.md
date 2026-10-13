# Staff request review and staff sign-in: assumptions to confirm

- There is no table for the verification checklist, the missing items or the rejection reason. They are stored in the status history row (`reason_code`, `reason`, `details`) and the patient sees them in `GET /requests/:id/timeline`.
- Pick-up needs the `blood_request.view` grant to cover the request's area (Support Agents hold Area scope) and the `blood_request.approve` grant. An agent can only verify, reject or ask for information on requests assigned to them. Another agent in the same area can see the request but gets 403.
- Pick-up creates a `TK_VERIFY_REQUEST` task (In progress), which is marked Done on verify or reject. Re-assigning to another agent (`blood_request.assign`, lead only) is not built yet.
- Moderators can reject only a request that has `has_moderation_hold` set. The moderation case itself (module Moderation) is not built, so the hold is set directly for now. The Assigned scope on their grant is not checked.
- The staff queue shows Submitted, Under review and Needs information, Critical first, then Urgent, then by required date. Duplicate and suspicious-request detection (FR-REQ-006 and 007) is not built, so nothing sets the hold automatically.
- The "call attempt recorded" checklist item is a plain tick box. Contact attempts are not linked to requests yet.
- The patient's "supply information" step does not take a document upload (no file storage yet). It only moves the request back to Under review with an optional message.
- Notifications (NTF-EV-02, 03, 17) are not sent. The outbox events `RequestInformationRequested`, `RequestVerified`, `RequestRejected` and others carry what the notification worker will need.
- On Verify the search run is not started yet. That belongs to module 3.
- Staff sign-in: password, then a 6-digit SMS code (`STAFF_MFA`) on a device that has not been verified in the last 30 days. The staff refresh token lasts 1 day (my choice; the documents do not say). Biometric or PIN step-up, the staff invitation flow and ADM role assignment are not built, so staff accounts are created directly in the database for now.
- `POST /auth/login` now returns either tokens or `{ mfaRequired: true, challengeId }`. The app then calls `POST /auth/staff/verify-code`.
