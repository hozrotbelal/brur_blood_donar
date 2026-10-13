# Module brief: Moderation (MOD)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.9 Moderation (MOD)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Abuse reports from users, system rules (duplicate detection, velocity) and Support referrals; moderation cases; decisions with evidence, reviewer, action and reason; appeals; outreach pause and resume; community content moderation (Phase 2) |
| Owned entities | abuse_report, moderation_case, moderation_action, appeal |
| Public APIs | /reports (user report); /moderation-cases (queue, get, assign, decide); /moderation-cases/{id}/actions; /appeals |
| Events published | AbuseFlagRaised, OutreachPaused, OutreachResumed, ModerationDecided, AppealDecided |
| Events consumed | RequestSubmitted (duplicate and velocity rules), UserRegistered (duplicate account rule), CommunityPostReported |
| Phase | Basic moderation Phase 1 (P1-I5); advanced fraud review Phase 2 |
