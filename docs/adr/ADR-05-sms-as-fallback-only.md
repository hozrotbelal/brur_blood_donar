# ADR-05 SMS as fallback only

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

SMS costs money, has length limits, and may reach shared phones; push and in-app are free and richer.

## Decision

In-app and push are primary; SMS is used for OTP, transactional security alerts (NTF-EV-21) and as a consented fallback only for time-sensitive events that allow it, with per-request caps.

## Alternatives

SMS for all invitations (rejected: cost, privacy, fatigue).

## Consequences

Lower cost and better privacy; delivery depends on push receipts and fallback windows, which must be tuned.
