# API guidelines

Source: 03 System Architecture Document, Sections 1.4, 7 and 14; ADR-07, ADR-08, ADR-10.

- REST/JSON under `/api/v1`. The OpenAPI specification is generated from code and is the contract; no endpoint without it.
- Every mutating call carries an `Idempotency-Key`. A repeated key returns the first result and creates no duplicate effect.
- Clients send commands, not statuses. The server enforces transitions and returns 409 or 422 for invalid ones; the app handles both.
- Patient-scoped endpoints never return donor identity, shortlist, contact or health information.
- Pagination on every list. Compact JSON with compression for low-bandwidth use; target response payload under 2 KB for donor responses.
- Documents and images are uploaded and viewed only through pre-signed URLs valid 5 minutes, issued after authorization and audited.
- Errors use a consistent envelope with a machine-readable code and a localized message key.
- Realtime updates (chat, Support queue, case timeline) use WebSocket with SSE fallback; background alerts use push.
