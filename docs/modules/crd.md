# Module brief: Case Workflow (CRD)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.6 Case Workflow (CRD)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Coordination case creation (exactly one per request) and assignment; case_donor links; task checklists and SLA due dates; contact attempts; appointments within a case; outcome updates with source and confidence; escalations; withdrawal and no-show handling; case transfer; closure and follow-up; state machine enforcement for request, case, appointment and task |
| Owned entities | coordination_case, case_donor, case_task, case_note, contact_attempt, appointment, outcome_update, sla_policy, escalation |
| Public APIs | /cases (queue, get, assign, transfer, close); /cases/{id}/tasks; /cases/{id}/notes; /cases/{id}/contact-attempts; /cases/{id}/donors (withdraw); /appointments (propose, confirm, reschedule, check-in, no-show, cancel); /cases/{id}/outcomes |
| Events published | CaseOpened, CaseAssigned, CaseTransferred, AppointmentConfirmed, AppointmentChanged, DonorWithdrawn, DonorNoShow, OutcomeRecorded, DonorConfirmationTimedOut, CaseOverdue, CaseDisputed, CaseClosed |
| Events consumed | InvitationResponded, RequestSubmitted, MatchRunReady, SearchLowResponse, DeliveryFailedCritical, RequestCancelled |
| Phase | Phase 1 (P1-I3); advanced routing Phase 2 |
