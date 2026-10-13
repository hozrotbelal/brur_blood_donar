# Database guidelines

Source: 04 ERD and Data Model; 03 System Architecture Document, Sections 11 and 14.

- PostgreSQL 16 or later with PostGIS. One schema per module; no cross-schema writes.
- Unique constraints and transactions implement exactly-once effects (ADR-03).
- Migrations use expand-and-contract and stay backward compatible. Test restores in staging.
- Donor location is stored twice: an exact point that is Restricted and encrypted, and an approximate point snapped to a grid of about 1 km. Matching and maps use only the approximate point (ADR-06).
- Every stateful entity writes the generic `status_history`. The `audit_event` table is append-only and hash-chained.
- Sensitive fields follow the data classification in document 04 (field-level encryption, masking).
- Retention periods are proposed and must be confirmed by the Organization (OI-08, OI-21).
- Synthetic seed data only outside production.
