# Module brief: Messaging and Support (SUP)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.7 Messaging & Support (SUP)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Conversations linked to a request or case; support tickets; callbacks; quick-reply templates for Support; unread counts; realtime delivery through the realtime gateway; masked communication (no direct donor-to-requester contact) |
| Owned entities | conversation, message, support_ticket, callback_request, message_template |
| Public APIs | /conversations; /conversations/{id}/messages; /tickets; /callbacks; /support/quick-replies |
| Events published | MessagePosted, TicketCreated, TicketReplied, CallbackScheduled, UrgentProblemReported |
| Events consumed | CaseOpened (creates case conversation), CaseTransferred |
| Phase | Phase 1 (P1-I3) |
