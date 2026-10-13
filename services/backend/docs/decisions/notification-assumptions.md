# Notification assumptions

- A missing preference row means the channel is allowed.
- Quiet hours defer delivery; they do not suppress it.
- SMS is a consented fallback only (ADR-05), capped at 2 per recipient per request per day.
- A push failure, or a missing push token, triggers the SMS fallback after the rule's delay when the rule allows it.
- Templates are generic per event and channel; English and Bangla versions are seeded.
- Events 06, 10, 12, 15-17, 19 and 21-23 are not produced yet.
- Push and SMS use simulated gateways that log only. The real SMS provider replaces `SimulatedSmsGateway`.
- The identity `SmsSender` and the notification `SmsGateway` are separate ports; unify them when the real provider is integrated.
- The outbox relay locks with `FOR NO KEY UPDATE SKIP LOCKED` to avoid deadlocking against the `source_outbox_event_id` foreign key.
