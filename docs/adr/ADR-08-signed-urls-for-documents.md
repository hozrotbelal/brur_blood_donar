# ADR-08 Signed URLs for documents

Source: 03 System Architecture Document, Section 18. Changing this decision needs a new ADR approved by a human.

## Context

Prescription and requisition images are highly sensitive and relatively large for low bandwidth.

## Decision

Private object storage; the app uploads and views via pre-signed URLs valid 5 minutes, issued after authorization; access audited.

## Alternatives

Proxying files through the API (rejected: load and latency); public buckets (rejected).

## Consequences

Efficient transfers; short expiry limits leakage; clock skew and retry handling needed on the client.
