# Event guidelines

Source: 03 System Architecture Document, Sections 5.1, 9 and 14; ADR-04.

- Write `outbox_event` in the same transaction as the state change. A worker relays it to queues.
- Delivery is at least once; every consumer is idempotent and uses a dedupe key.
- Notifications: pipeline with retries, backoff, SMS fallback only where consented and allowed, quiet hours, limits and delivery-failure reporting.
- Queued messages are cancelled when the case or request state makes them stale.
- Monitor outbox lag and dead jobs.
- Event names and owners are listed in the domain event catalogue (architecture document, Section 5.1) and in each module brief.
