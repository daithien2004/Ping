# ADR-0037: v0.1.0 scope is local-only; staging moves to v0.2.0

Status: accepted
Date: 2026-10-21

## Decision

- Tag `v0.1.0` as a **code milestone**, not a deployment milestone. Its acceptance gate is the code,
  security and reliability evidence already produced on the owner's machine and in CI. It records
  what was built and verified, not that the application is running for real users anywhere.
- Mark the four deployment-environment items in `docs/acceptance/v0.1.0.md` as **out of scope for
  v0.1.0** and move them to a separate **v0.2.0** milestone: choosing a staging environment and
  domain, an automated TLS lifecycle, an off-machine backup schedule with retention, drills on that
  environment, and wiring Prometheus/Alertmanager plus staging Sentry.
- Keep the local practice stack from [ADR-0036](0036-local-deployment.md) as the highest level of
  deployment evidence v0.1.0 claims. Local Docker evidence is not relabelled as staging, exactly as
  ADR-0036 and [ADR-0035](0035-nginx-reverse-proxy.md) already state.
- Record the owner's threat-model approval as an owner confirmation, in the same wording already used
  for the four sensitive-area reviews. It is not an independent audit and must not be described as one.
- Do not treat a merged-but-unpushed local `main` as a release. CI must run green on the exact commit
  before a tag exists, and pushing needs the owner's explicit instruction.

## Reason

The owner wants a real deployment but does not yet have the budget or time for a hosting environment,
domain and automated backups. The code side is already covered by unusually thorough evidence for a
project of this size: unit, API e2e, web e2e with accessibility scans, IDOR, real-time multi-instance
tests, migration upgrade checks, load reports, the Nginx/TLS smoke suite, and the local deployment
drills. Blocking the version number on money and infrastructure would stall the work for a reason
that has nothing to do with code quality, and would put pressure to pretend the local stack is
staging — the exact mislabelling the existing ADRs forbid.

Separating the two milestones keeps both honest: v0.1.0 says "this code is finished and verified",
v0.2.0 will say "this code runs somewhere real". Neither claim is inflated to cover the other.

## Alternatives considered

- **Choose staging now (a small VPS or cloud instance).** The most complete option and the one that
  eventually has to happen. Rejected for v0.1.0 only because the owner is not ready to spend on it
  yet; it is the intended content of v0.2.0, not a rejected idea.
- **Call the local Docker stack "staging".** Cheaper and faster, but contradicts ADR-0036, which says
  the local practice "does not complete staging acceptance". It would also prove nothing new: the
  same machine, the same loopback network, no DNS, no firewall, no remote disk. Rejected as
  self-deception rather than an engineering choice.
- **Keep the staging items in the v0.1.0 checklist as unmet.** Honest about status, but leaves the
  gate permanently red while a tag is issued, which makes the gate meaningless. Moving them to a
  named milestone states the same truth without a checklist that can never pass.

## Consequences

- `v0.1.0` must never be described as "deployed" or "in production" in documentation, release notes
  or conversation. The README, acceptance checklist and this ADR anchor that wording.
- The four moved items keep their existing evidence (local drills, Sentry local checks, `ops/alerts.yml`)
  as preparation for v0.2.0; that evidence is preserved, not discarded.
- New work that only makes sense on a real environment — registry pushes, `ghcr.io` images, cron
  backups, the monitoring stack — belongs to v0.2.0 and should not be started under this milestone.
- A future release that does reach a real environment will require its own ADR describing that
  environment, because this ADR deliberately does not choose one.

## References

- [ADR-0032: CI and containers](0032-ci-and-containers.md) — deploy/backup requirements kept for v0.2.0.
- [ADR-0034: developer experience and docs](0034-developer-experience-and-docs.md) — docs/runbook expectations.
- [ADR-0035: Nginx reverse proxy](0035-nginx-reverse-proxy.md) — local vs staging evidence boundary.
- [ADR-0036: local deployment practice](0036-local-deployment.md) — the practice stack and its limits.
- [Acceptance checklist v0.1.0](../acceptance/v0.1.0.md), [technical debt](../tech-debt.md).
