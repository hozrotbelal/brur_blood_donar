# Module brief: Audit (AUD)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.13 Audit (AUD)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Audit pipeline (Section 13.4): append-only, hash-chained audit_event for every category (AUTH, DATA_CHANGE, STATUS_CHANGE, APPROVAL, ASSIGNMENT, COMMUNICATION, SENSITIVE_READ, SEARCH, EXPORT, LOCATION, PERMISSION, CONFIG), including denied attempts; generic status_history for every stateful entity (Section 11.5) and History timelines; audit viewer scoped by permission; "Who accessed my details" for every user; audit and search-result exports with approval (data_export); write-once archive and daily chain verification |
| Owned entities | audit_event, status_history, data_export |
| Public APIs | /audit (own, assigned, moderation and all scopes; access summary "Who accessed my details"; record history timeline); /audit/exports (request, approve, download) |
| Events published | DataExportRequested, DataExportApproved, AuditChainBroken |
| Events consumed | Audit records from every module through outbox_event; status changes from the workflow engine |
| Phase | Phase 1 (P1-I5, with writes from P1-I1 onward) |
