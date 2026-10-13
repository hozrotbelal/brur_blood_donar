# Deployment strategy

Source: 03 System Architecture Document, Section 15. Hosting region and residency are open (OI-20).

- Environments: development, staging, production. Each has its own cloud account or project, secrets, keys, push credentials and SMS sandbox or sender setup. Mobile flavours dev, staging and prod have distinct bundle identifiers.
- Production: containers on a managed Kubernetes or container service across at least two availability zones; API and realtime with at least two replicas; workers autoscaled on queue depth; one active scheduler with standby.
- Managed PostgreSQL with PostGIS (standby, point-in-time recovery, read replica), managed Redis with persistence, private encrypted object storage, load balancer with WAF.
- Backend pipeline: lint, unit and module-boundary tests, OpenAPI contract tests, SAST, dependency and container scanning, image build, automatic development deploy, staging on merge to main, manual approval for production, rollback on failed health checks.
- Mobile pipeline: build per flavour, tests, accessibility and localisation checks, internal testing tracks, staged rollout with crash-rate gates.
- Infrastructure as code (Terraform or OpenTofu) reviewed in pull requests, with weekly drift detection.
- Proposed targets: 99.5% monthly API availability, RPO 15 minutes, RTO 4 hours.
