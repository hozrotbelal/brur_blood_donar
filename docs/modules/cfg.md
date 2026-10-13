# Module brief: Configuration (CFG)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.14 Configuration (CFG)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Versioned settings with scope (global, area, urgency): outreach windows, wave sizes, radius steps, contact limits, reminder timing, escalation deadlines, quiet hours, SMS fallback rules, forced-upgrade minimum versions; approval of changes; effective-dated values; cache invalidation |
| Owned entities | config_setting (plus idempotency_key, outbox_event and job_run as shared platform tables administered here) |
| Public APIs | /admin/config (list, propose, approve, history); /config/public (client-visible settings such as minimum app version) |
| Events published | ConfigChanged |
| Events consumed | None |
| Phase | Phase 1 (P1-I4) |


## 6. Mobile app architecture

Diagram D-23 — Mobile app architecture (rendered in the BBDA Diagram Atlas; source in Appendix)
