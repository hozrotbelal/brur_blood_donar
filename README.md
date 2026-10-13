# BBDA — Brur Blood Donation Application

A mobile-first (Android and iOS) coordination app that connects verified blood requests with willing, consenting donors. It is a coordination and communication tool only: no clinical screening, no compatibility decisions, no blood inventory.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/mobile` | Flutter app with five role shells (Donor, Patient or Representative, Support, Moderation, Administrator) |
| `services/backend` | NestJS modular monolith: 12 module folders, platform code, and three entry points (api, realtime, worker) |
| `packages` | Shared API contract and design tokens (contracts and labels only, never business logic) |
| `infra` | Container, pipeline and infrastructure-as-code files |
| `docs` | Requirements, architecture, data model, workflows, ADRs, module briefs, open issues, security |
| `scripts` | Repository safety checks |
| `CLAUDE.md` | Rules every AI agent must follow in this repository |

## Where to start

1. Read `CLAUDE.md`.
2. Read `docs/product` and `docs/architecture`.
3. Open the brief for the module you will touch in `docs/modules`.
4. Check `docs/decisions/open-issues.md` before assuming any business rule.
5. Source documents (Word) are in `docs/source-documents`.

## Status

Foundation stage (Week 1 of the Agent-Based Development plan). The structure, rules, module briefs, ADRs and open issues are in place. No application dependencies are installed yet; see `docs/security/malware-prevention-checklist.md` before installing anything.
