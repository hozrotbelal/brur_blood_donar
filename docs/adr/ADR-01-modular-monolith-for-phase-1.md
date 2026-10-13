# ADR-01 Modular monolith for Phase 1

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Phase 1 must deliver a complete service loop quickly with a small team; transactions span request, matching and case (for example response plus case creation).

## Decision

Build one deployable backend with thirteen enforced modules, one PostgreSQL database with schema per module, and separate runtime roles (API, realtime, worker).

## Alternatives

Microservices from day one (rejected: distributed transactions, operational cost); unstructured monolith (rejected: hard to extract later).

## Consequences

Simple local transactions and exactly-once effects; boundary discipline needs automated tests; Notification and Matching can be extracted in Phase 2.
