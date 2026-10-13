# ADR-14 Separate purposes for sign-in location and donor location

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Addendum A2 adds sign-in location capture for account security, while donor location serves outreach. Mixing them would repurpose security data for matching and track donors.

## Decision

Two data sets, two consents (LOGIN_LOCATION and LOCATION_USE), two tables (login_event and donor_location), different precision (reduced to 1000 m or 100 m for sign-in; fixed 1 km grid plus encrypted exact point for donors), different visibility and retention; sign-in location is never used for matching or the donor map.

## Alternatives

One shared location record (rejected: purpose limitation and consent).

## Consequences

Clear privacy story; two consent prompts; no reuse of sign-in location for convenience features.
