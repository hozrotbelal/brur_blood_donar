# Module brief: Reporting and Analytics (RPT)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.12 Reporting & Analytics (RPT)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Role-specific timelines and reports; KPI-01 to KPI-12; dashboards; report_snapshot and kpi_daily aggregation; exports; aggregation of personal data where individual detail is unnecessary |
| Owned entities | report_snapshot, kpi_daily (plus read-model views in the reporting schema) |
| Public APIs | /reports/me (donor and patient history); /reports/support; /reports/moderation; /reports/admin (dashboard, funnels, delivery); /reports/exports |
| Events published | ReportSnapshotReady |
| Events consumed | All status-change events (to maintain read models) |
| Phase | Core reports Phase 1 (P1-I5); forecasting and deeper analytics Phase 2 |
