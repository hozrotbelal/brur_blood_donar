# ADR-10 REST plus WebSocket

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Most interactions are request and response; chat and Support queues need live updates.

## Decision

REST/JSON API under /api/v1 documented in OpenAPI, plus WebSocket (with SSE fallback) for chat, queue and timeline updates; push for background alerts.

## Alternatives

GraphQL (rejected: harder caching and authorization per field for a small team); gRPC to mobile (rejected: tooling and debugging on hostile networks).

## Consequences

Simple, cacheable, well-understood API; realtime gateway scaled via Redis pub/sub.
