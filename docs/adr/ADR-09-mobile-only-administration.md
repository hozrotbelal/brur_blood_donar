# ADR-09 Mobile-only administration

Status: Partly superseded by [ADR-15](ADR-15-staff-web-portal.md) for staff access only. Donor and patient decisions here are unchanged.

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

The scope requires everything to be managed from the mobile apps; no web admin panel.

## Decision

All ADM controls (templates, rules, limits, SLAs, bulk-send approval, pause controls, delivery reports, team, audit search) live in the Administrator shell with step-up; configuration changes are versioned and reviewable.

## Alternatives

Web console (out of scope; possible future option).

## Consequences

Admin UX must be designed for small screens (guided forms, previews); complex bulk operations are limited.
