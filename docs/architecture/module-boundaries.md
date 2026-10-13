# Module boundaries

Source: 03 System Architecture Document, Section 5. Per-module briefs are in `docs/modules`.

| Code | Module | Folder |
| --- | --- | --- |
| IDN | Identity and Access; Profile and Consent | `services/backend/src/modules/identity` |
| REQ | Request | `.../request` |
| SRC | Matching | `.../matching` |
| CRD | Case Workflow | `.../case-workflow` |
| SUP | Messaging and Support | `.../support` |
| NTF | Notification | `.../notification` |
| MOD | Moderation | `.../moderation` |
| APT | Appointments and Campaigns | `.../appointments` |
| COM | Community (Phase 2) | `.../community` |
| RPT | Reporting and Analytics | `.../reporting` |
| AUD | Audit | `.../audit` |
| CFG | Configuration | `.../configuration` |

Rules:

- A module owns its tables in its own PostgreSQL schema.
- Other modules read them only through the owner's public service interface or a read model.
- Cross-module writes are forbidden.
- Modules communicate in-process through public interfaces and asynchronously through domain events written to `outbox_event` in the same transaction.
- Authorization runs in the shared policy component before module logic; modules re-check ownership.
- Automated architecture tests fail the build if a module imports another module's internals.
