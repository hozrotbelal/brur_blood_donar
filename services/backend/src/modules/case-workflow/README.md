# CRD module

Brief: `docs/modules/crd.md`. Expose one public interface; keep everything else private to this folder.

## Data access

Drizzle over the module's `schema.ts` (ADR-16). This module writes only `crd` tables. Other modules' state changes go through their public functions:

| Change | Owner function |
| --- | --- |
| Request back to `Searching` (no donors left, more donors needed) | `returnToSearching` (request) |
| `donation_reported_at`, `Donor coordination` to `Awaiting outcome` | `markDonationReported` (request) |
| `Awaiting outcome` to `Fulfilled` or `Partially fulfilled` | `recordFulfilment` (request) |
| `Fulfilled` or `Partially fulfilled` to `Closed` | `closeRequest` (request) |
| Any allowed status to `Unable to fulfil` | `declareRequestUnable` (request) |
| Open invitations cancelled when the request cannot be fulfilled | `cancelOpenInvitations` (matching) |

Reads use `requestState` and `requestRouting` (request), `donorLabels` and `donorProfileIdOf` (identity), and `facilityNames` and `isActiveFacility` (appointments). The module also offers `openBatchReviewTask`, `cancelBatchReviewTask`, `completeBatchReviewTasks` and `caseOwnersForRequest` to matching and notification.

Raw SQL remains, with the reason in the service, for the donor appointment list (PostGIS facility coordinates across identity and appointments) and the scan that finds cases whose request has ended.
