# Module brief: Request (REQ)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.4 Request (REQ)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Blood request lifecycle from Draft to Closed including Rejected, Cancelled and Unable to fulfil; validation; document metadata and signed URL issuance; permitted-update requests; overlay flags outreach_paused, priority and has_moderation_hold; status history; patient-facing milestone projection |
| Owned entities | blood_request, request_document, request_change (status changes are recorded in the generic status_history, Section 11.5) |
| Public APIs | /requests (create draft, update, submit, cancel, list own); /requests/{id}/documents (upload-url, complete, view-url); /requests/{id}/changes; /requests/{id}/verify, /reject, /request-information (SUP); /requests/{id}/timeline |
| Events published | RequestSubmitted, InformationRequested, RequestVerified, RequestRejected, RequestChanged, RequestCancelled, RequestStatusChanged, OutreachPaused, OutreachResumed |
| Events consumed | CaseOpened, OutcomeRecorded, DonorWithdrawn (status transitions via Case Workflow commands); ModerationDecided (REJECT_REQUEST, PAUSE_OUTREACH) |
| Phase | Phase 1 (P1-I1, P1-I2) |
