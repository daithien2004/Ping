# ADR-0061: AI observability and durable daily budget metrics

Status: accepted (implementation of approved T5.11 scope)
Date: 2026-10-25

## Decision

Extend ADR-0031/0047 with finite-outcome latency histograms for Ask stream lifetime
(`ai_latency_seconds`), Qdrant HTTP requests through response headers
(`qdrant_latency_seconds`) and FTS service calls (`search_latency_seconds`). Preserve
`ai_llm_duration_seconds` and existing request/token/cost counters. Rejected calls and
failed operations are measured; generator cancellation has its own outcome. Authorization
before opening the Ask stream remains outside its timer. No resource IDs, questions,
URLs or message content become metric labels.

Read the global current UTC-day cost from `AiUsage` during each metrics scrape. Export
`ai_daily_spent_usd`, configured `ai_daily_budget_usd` and `ai_budget_metrics_up`.
Both spending and collector-health await the same read per scrape. DB failure yields
NaN spending and health 0, never a stale healthy value. All replicas read the same
sum: aggregate using MAX, not SUM. Counter increases cannot represent a durable UTC-day
budget across restarts, midnight, or multiple replicas.

`PingAiBudgetWarning` fires above 80% for two minutes when budget > 0 and collection
is healthy. Budget 0 disables the warning, consistent with the kill-switch. A separate
alert reports failed budget collection. Daily accounting follows UTC, as in ADR-0047.

Provide an optional, independent local Docker Compose project for Prometheus 3.15.0
and Grafana OSS 13.2.4. Provision datasource/dashboard from versioned files. UI ports
bind loopback; anonymous access is read-only for this local demo. This does not change
the production stack or establish a staging notification receiver. No paid service or
new application dependency is required.

## Reason

T5.7 already records usage; T5.11 adds visibility and an early warning before the
kill-switch. Durable daily gauges avoid double counting replicas and losing budget
history when an API process restarts. A local stack allows the alert and dashboard
to be demonstrated without paid infrastructure or changing the active chat environment.

## Alternatives

- `increase(ai_cost_usd_total[24h])`: rolling 24h is not a UTC calendar day, misses
  prior process lifetime, and depends on scrape continuity.
- SUM daily gauges across replicas: counts the same DB total repeatedly.
- Hosted Grafana/production Compose changes: deferred with paid/staging infrastructure.

## Consequences

Each scrape adds one bounded aggregate DB query per instance; existing Prisma query
and pool timeouts apply. Prometheus scrape failure is independently covered by
`PingInstanceDown`. Daily spending is estimated from configured provider prices;
free-tier prices 0 yield spending 0. The pre-existing concurrent-request budget
overshoot tradeoff in ADR-0047 is unchanged.

The local fixture uses real MetricsService HTTP exposition with mocked DB/Redis
adapters and synthetic traffic. Screenshots from it prove monitoring wiring and firing,
not real provider costs, LLM availability or production performance. Real Postgres
aggregation is separately covered by API e2e.
