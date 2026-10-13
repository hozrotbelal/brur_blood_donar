# Module brief: Matching (SRC)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.5 Matching (SRC)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Search runs (waves); filter pipeline with reason codes; ordering (Phase 1) and weighted ranking (Phase 2); batch approval; invitation lifecycle and responses; contact limits; radius expansion; wave timers; cancellation of obsolete invitations; donor search (basic in a request context, advanced outside a request, export through data_export); donor map service (Section 8.9); search_event recording |
| Owned entities | match_run, match_candidate, invitation, invitation_response, outreach_group_rule, search_event |
| Public APIs | /match-runs (list for request, get with candidates and reasons, approve, reject, request next wave, expand radius); /invitations (donor list, view, respond, withdraw); /donor-search (basic, advanced, export request); /map (donor clusters and approximate pins with filters); /admin/outreach-rules |
| Events published | MatchRunReady, InvitationsQueued, InvitationResponded, InvitationExpired, SearchLowResponse, SearchExhausted, SearchPerformed |
| Events consumed | RequestVerified, RequestChanged, RequestCancelled, OutreachPaused, OutreachResumed, ConsentWithdrawn, AvailabilityChanged, DonorWithdrawn, DonorNoShow |
| Phase | Phase 1 filters, simple ordering, Support-approved batches, donor search and map; Phase 2 ranked matching and automated waves |
