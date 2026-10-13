# Module brief: Notification (NTF)

Source: 03 System Architecture Document, Section 5. This is a working brief; the source document wins on any difference.

Rules: the module owns its tables in its own PostgreSQL schema; other modules use only its public service interface, read models or outbox events; no cross-module writes.


## 5.8 Notification (NTF)


| Aspect | Detail |
| --- | --- |
| Responsibilities | Rule evaluation; recipient resolution; bn and en template rendering; consent, quiet-hours and limit checks; channel selection; provider adapters; retries and fallback; receipts; in-app inbox; cancellation of queued messages; delivery-failure reporting |
| Owned entities | notification_event, notification, delivery_attempt, notification_template, template_version, notification_rule, suppression |
| Public APIs | /notifications (inbox, mark read, receipt ack); /devices/push-token; /admin/templates (draft, submit, approve, publish); /admin/notification-rules; /admin/delivery-reports; /admin/bulk-sends (approve) |
| Events published | NotificationSent, NotificationDelivered, NotificationFailed, DeliveryFailedCritical |
| Events consumed | All events mapped in Section 5.1; ConsentWithdrawn, RequestCancelled, OutreachPaused (cancellation) |
| Phase | Phase 1 (P1-I4) |
