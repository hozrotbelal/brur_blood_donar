# ADR-13 Time-limited reveal grants for phone and exact location

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Support must call donors and sometimes know an exact location, but permanent visibility invites misuse.

## Decision

Phones are masked and exact points encrypted by default; a Reveal action with reason and step-up creates a sensitive_access_grant valid 15 minutes (privacy.reveal_ttl_minutes) for one donor, one field and one active request; values are watermarked, never cached or copied into notes; daily limits and NTF-EV-23 alerts; every reveal and denial is audited and summarised to the donor.

## Alternatives

Always-visible phones for assigned staff (rejected: no friction or trace); manual approval of each reveal (rejected: too slow for urgent coordination).

## Consequences

Small extra step for staff; strong traceability; proxied calling can later remove the need to reveal phones (OI-25).
