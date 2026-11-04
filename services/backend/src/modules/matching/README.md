# SRC module

Brief: `docs/modules/src.md`. Expose one public interface; keep everything else private to this folder.

## Data access

Drizzle over the module's `schema.ts` (ADR-16). This module writes only `src` tables. Other modules' state changes go through their public functions:

| Change | Owner function |
| --- | --- |
| Request `Verified` to `Searching`, `Searching` to `Donor coordination`, `first_invited_at`, `first_willing_at` | `markSearching`, `markFirstWilling`, `markFirstInvited` (request) |
| `TK_REVIEW_BATCH` task opened, cancelled, completed | `openBatchReviewTask`, `cancelBatchReviewTask`, `completeBatchReviewTasks` (case workflow) |
| Donor `last_response_at` | `touchDonorResponse` (identity) |

Reads use `activeGlobalSettings` (configuration), `donorLabels` and `donorProfileIdOf` (identity). The worker that starts searches for newly verified requests skips requests with no location (no request point, hospital location or area centre), because they can never start and would otherwise block newer requests.

Raw SQL remains, with the reason in the service, for the donor facts query (PostGIS distance across identity, case and request data), the request lock that also reads facility and area location, the scans that find requests to search, `cancelForEndedRequests`, and the `dispatchDue`, `expireDue` and `reaskDue` worker loops (`SKIP LOCKED`).
