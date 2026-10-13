# ADR-04 Transactional outbox for domain events and notifications

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

A notification must be sent if and only if the business change committed; the system must tolerate crashes and retries.

## Decision

Write outbox_event in the same transaction as the change; a relay publishes to queues; consumers are idempotent with dedupe keys.

## Alternatives

Publish directly to a queue after commit (rejected: lost or phantom events); distributed transactions (rejected).

## Consequences

At-least-once delivery with idempotent consumers; small publication delay (seconds); outbox lag must be monitored.
