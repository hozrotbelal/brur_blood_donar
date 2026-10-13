# ADR-07 Server-side state machines

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Many roles and offline clients interact with the same request and case; milestones must never be merged.

## Decision

Declarative transition tables and guards enforced by the server; clients send commands, not statuses.

## Alternatives

Client-driven status updates (rejected: inconsistency, security).

## Consequences

Consistent statuses and audit; the app must handle 409 and 422 gracefully.
