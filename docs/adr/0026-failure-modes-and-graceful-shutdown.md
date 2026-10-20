# ADR-0026: Failure modes and graceful shutdown

Status: accepted (replaces the "Consequences" paragraph of ADR-0011 about Redis outages)
Date: 2026-10-20

## Decision

- **Timeouts everywhere.** Postgres: `statement_timeout` and `query_timeout` = `PG_QUERY_TIMEOUT_MS`
  (10s), connection wait 5s. Redis: `commandTimeout` = `REDIS_COMMAND_TIMEOUT_MS` (1s), one retry per
  command, `RedisProvider.isUp`. The provider waits up to 2s for its first connection at boot (still
  not fail-fast, ADR-0011), otherwise the first requests would be refused as "Redis not ready".
- **Postgres unavailable → 503.** `isDatabaseUnavailable()` recognizes the real error shapes of
  Prisma 7 + `@prisma/adapter-pg` (system codes such as `ECONNREFUSED` on a Prisma error,
  `P2010`/`P2039` carrying Postgres `57014`, plain `pg` errors such as "Query read timeout"). The
  filter answers `503 SERVICE_UNAVAILABLE` with a `requestId`, never a stack or host/port. Data
  errors (`P2002`, `P2025`, constraint violations) are not outages and keep their old handling.
  Boot still fails fast without Postgres.
- **Redis down → per-component policy** (table in `docs/runbook/failure-modes.md`):
  fail-open for rate limit, ability cache, event publishing, presence counting; fail-closed (503)
  for `login`/`register`/`refresh` (`@RateLimitFailClosed()`) and requests carrying
  `Idempotency-Key`. Components check `redis.isUp` first so a request never waits for per-command
  timeouts. New Redis calls on the request path must pick a policy (`failOpen`, `redisUnavailable`).
- **The socket.io Redis adapter's `publish` is wrapped** (`withSafePublish`): the library calls it
  without awaiting or catching, so a dead Redis produced an unhandled rejection and a Node exit.
- **`/ready`:** 503 when draining or Postgres is down; **200 `degraded`** when only Redis is down.
  `/health` is unchanged and never touches dependencies.
- **Shutdown order (fixes O1).** Nest 12 runs `onModuleDestroy`, then `beforeApplicationShutdown`,
  then closes Socket.IO and HTTP, then `onApplicationShutdown`. Redis and Prisma now close in
  `onApplicationShutdown` (before: `onModuleDestroy` / `beforeApplicationShutdown`, i.e. before
  in-flight requests and sockets were done). `ShutdownService.beforeApplicationShutdown(signal)`:
  on a signal it starts draining, waits `SHUTDOWN_GRACE_MS`, and arms a watchdog that calls
  `exit(1)` after `SHUTDOWN_TIMEOUT_MS`. An explicit `app.close()` without a signal does not wait
  (tests, scripts).
- **Verification:** unit and e2e tests (a real app against real Postgres with a dead Redis provider,
  an in-flight request across `close('SIGTERM')`, the close order) plus two drills that stop the
  real containers (`drill:redis` 12/12, `drill:postgres` 10/10).

## Reason

Postgres is the source of truth and Redis only holds cache, counters and pub/sub (rule 2), so losing
Redis must not stop messaging. Where Redis is the only protection (credential-stuffing limits,
duplicate-create guard), failing open would silently drop that protection, so those refuse instead.
Closing infrastructure last is the only order in which in-flight work can finish.

## Alternatives considered

- `/ready` 503 while Redis is down: rejected, it would remove every instance that can still serve
  REST from the load balancer for a cache/pub-sub outage. Monitoring reads `degraded` instead.
- Fail-open everywhere: rejected for login and idempotent creates (see Reason).
- `enableOfflineQueue: false` in ioredis: rejected, the adapter's subscriber is a duplicate of the
  same options and would fail before the first connection.
- Terminus' own graceful shutdown (`gracefulShutdownTimeoutMs`): it also turns health checks into
  503 during shutdown, but its delay is fixed when the module is imported, before configuration is
  available. We keep `ShutdownService` (configurable, testable) and let both agree.
- A real SIGTERM test on Windows: impossible (the OS cannot deliver SIGTERM to a child process);
  covered with `app.close('SIGTERM')` and a Linux/staging drill later.

## Consequences

During a Redis outage permissions may stay stale up to 30s after a role change, cross-instance
realtime events are lost (clients refetch on reconnect), and logins are refused. A Redis outage at
boot leaves the API up in degraded mode. Production must set `SHUTDOWN_GRACE_MS` to at least twice
the load balancer's health-check interval and `SHUTDOWN_TIMEOUT_MS` below the orchestrator's kill
timeout.
