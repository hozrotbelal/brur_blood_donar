# ADR-03 PostgreSQL with PostGIS

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Strong consistency for workflows, relational data, approximate geo queries, and reporting.

## Decision

Managed PostgreSQL with PostGIS as the system of record, read replica for reporting.

## Alternatives

Document database (rejected: weaker constraints needed for idempotency); separate geo service (unnecessary).

## Consequences

Unique constraints and transactions implement exactly-once effects; geo queries on approximate points are efficient with GiST indexes.
