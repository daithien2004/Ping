# ADR-0011: Database, Redis, rate limiting and health checks

Status: accepted
Date: 2026-10-19 (records decisions made on 2026-10-18)

## Decision

- Prisma 7 with the `prisma-client` generator and the `@prisma/adapter-pg` driver adapter; the
  CLI reads `prisma7.config.ts`, which loads the repository-root `.env`. Generated code lives in
  `src/generated/` and is not committed.
- `PrismaService` connects on boot (the app fails fast without Postgres). `RedisProvider` does not
  fail fast: ioredis keeps reconnecting and logs warnings, and `/ready` reports Redis down.
- Rate limiting is global (100 requests/min/IP, stricter on login and register) with counters in
  Redis via a Lua script, so all instances share them. It applies to HTTP only. `TRUST_PROXY`
  must match the number of proxies in front of the API for per-IP limits to work.
- `GET /api/v1/health` (liveness) never touches dependencies; `GET /api/v1/ready` (readiness)
  checks Postgres and Redis. Neither is rate limited.

## Reason

Postgres is the source of truth, so starting without it is pointless. Redis outages degrade
realtime and rate limiting but should not crash-loop the API. In-memory rate limits would break
with more than one instance (rule 1).

## Alternatives considered

- Fail fast on Redis too — rejected for now: a Redis blip at deploy time would block startup;
  readiness already keeps traffic away until Redis is back.
- Liveness that checks the database — rejected: an orchestrator would restart healthy processes
  in a loop while the database is down.

## Consequences

Superseded by [ADR-0026](0026-failure-modes-and-graceful-shutdown.md): a Redis outage now degrades
the service instead of failing most requests, and `/ready` reports `degraded` rather than removing
the instance from the load balancer. (Original text: while Redis is down, rate limiting and the
ability cache fail, so most requests error until it returns.)
