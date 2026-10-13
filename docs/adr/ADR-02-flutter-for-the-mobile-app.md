# ADR-02 Flutter for the mobile app

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

One app, five role shells, two platforms, Bangla text, low-end devices, offline storage.

## Decision

Flutter with encrypted SQLite and secure storage.

## Alternatives

React Native (acceptable if the team is stronger in it); native (rejected on cost).

## Consequences

Single codebase and consistent rendering; attention needed to binary size and plugin maintenance.
