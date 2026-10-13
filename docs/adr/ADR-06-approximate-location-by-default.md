# ADR-06 Approximate location by default (amended in version 1.2)

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Donor location is sensitive; outreach needs only rough distance, but coordination sometimes needs the exact place (Addendum A2).

## Decision

Matching and the donor map use the administrative area and a point snapped to a fixed grid of about 1 km; the exact point is stored encrypted and Restricted and revealed only through a time-limited grant (ADR-13); no live tracking; capture only with LOCATION_USE consent, manual entry or a donor-confirmed Support entry.

## Alternatives

Approximate only (superseded: Support could not locate a willing donor); exact location with live tracking (rejected: privacy risk, not needed); random jitter (rejected: can be averaged out).

## Consequences

Distance bands are approximate; exact-point access is controlled and audited; directions are handed to the user's maps app.
