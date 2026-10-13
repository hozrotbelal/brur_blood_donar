# ADR-12 Permission-set authorization inside five roles

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

The Organization needs a hierarchy (Support Agent and Lead, Moderator and Lead, Administrator and Primary Administrator) and granular phone, search and export permissions, while the five-role rule stays.

## Decision

Keep five roles; model tiers as permission sets of resource.action keys with scopes (Own, Assigned, Area, All), assigned by ADM with optional expiry; evaluate every request in one policy decision point that combines role, tier, permission sets, assignment, area, record state, consent and reveal grants; no self-grants, no granting of permissions one lacks, and second ADM approval for sensitive grants.

## Alternatives

More roles (rejected: breaks the five-role scope); hard-coded role checks (rejected: not granular or auditable); external policy engine in Phase 1 (deferred: extra operational cost; the PDP interface allows it later).

## Consequences

Consistent, auditable decisions and least privilege; a permission catalogue and matrix to maintain; policy caching and invalidation needed.
