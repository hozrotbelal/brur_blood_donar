# REQ module

Brief: `docs/modules/req.md`. Expose one public interface; keep everything else private to this folder.

## Patient endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /requests/{id}/changes` | Permitted update (FR-REQ-014). A draft is edited directly. After submission, contact phone, special instructions and a quantity decrease apply at once (`Auto-applied`). Blood group, component, quantity increase, facility, required date and urgency become `Pending` changes for Support, and the old values stay until approved. One pending change per type (`CHANGE_PENDING`). Allowed from Draft to Donor coordination (`UPDATE_NOT_ALLOWED` after that). |
| `GET /requests/{id}/changes` | The request's change requests, newest first. |
| `GET /requests/{id}/progress` | Aggregate search counts only (FR-REQ-018): donors contacted, responded, willing, and the search wave. Read through the matching module's `read-model.public.ts`. |
| `POST /requests/{id}/urgent-problem` | "Report an urgent problem" (FR-REQ-019): raises priority Normal to High, then High to Critical, writes an audit event and the `UrgentProblemReported` outbox event. |
| `GET /requests/{id}/timeline` | Status history with the actor's role only, never a staff name. |

`RequestViewDto` also carries the patient reference, hospital and collection names (from the appointments module's `read-model.public.ts`) and the latest outcome confidence (from the case-workflow module's `read-model.public.ts`).

## Support endpoints for changes

| Endpoint | Purpose |
| --- | --- |
| `GET /staff/requests/{id}` | The detail now includes `changes`. |
| `POST /staff/requests/{id}/changes/{changeId}/approve` | Applies the proposed values, marks the change Approved, writes history and the `RequestChangeApproved` event. |
| `POST /staff/requests/{id}/changes/{changeId}/reject` | Marks the change Rejected with a reason; the request keeps its values. |

On `RequestChangeApproved` the matching module (`change-recheck.subscriber.ts`) cancels unanswered invitations with reason `REQUEST_CHANGED`, supersedes any wave still waiting for approval, and proposes a new wave when the request is Searching (FR-REQ-015). It emits `InvitationsCancelled`, and the notification planner sends NTF-EV-13 to those donors.

Still to do: the alert to the assigned agent on `UrgentProblemReported` (OI-38), and a queue view that lists requests with pending changes (today Support opens them from the request link).
