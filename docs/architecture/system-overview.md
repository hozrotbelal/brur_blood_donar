# System overview

Source: 03 System Architecture Document, Sections 1 and 4.

- One Android and iOS app with five role shells, built with Flutter, encrypted local SQLite and secure storage.
- One backend codebase, a NestJS modular monolith with 12 module folders, deployed as three runtimes: API, realtime gateway (WebSocket with SSE fallback) and worker and scheduler.
- PostgreSQL 16 or later with PostGIS as the system of record; one schema per module; one read replica for reports.
- Redis for cache, rate limits, locks, BullMQ job queues and pub/sub. The PostgreSQL outbox remains the source of truth for events.
- Private S3-compatible object storage; documents are accessed through 5-minute signed URLs.
- Push through FCM and APNs. SMS through a Bangladesh aggregator, as fallback only (ADR-05).
- REST/JSON under `/api/v1`, documented in OpenAPI generated from code, plus WebSocket for chat, queues and timelines (ADR-10).

Open decisions that affect this baseline: backend framework (OI-22), hosting region and data residency (OI-20), SMS aggregator (OI-26), maps and tile provider (OI-27, OI-28).
