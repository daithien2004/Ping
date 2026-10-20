# ADR-0033: Load testing

Status: accepted
Date: 2026-10-20

## Decision

- **k6, with a hand-written Socket.IO client (`tools/loadtest/lib/socketio.js`, ~60 lines)** over k6's WebSocket
  module: k6 is already installed and needs no new dependency; the protocol subset ping uses (Engine.IO open,
  `40` connect with auth, ping/pong, `42` events, `43` acks) is small. Artillery's Socket.IO engine was the
  alternative; it would add a large dependency for one script.
- **Scenarios** follow guide 16.3: REST history reading (`rest-history.js`), socket fan-out with sender and
  listener on different instances and a timestamp in the message content (`socket-fanout.js`), reconnect
  storm and restart-one-instance (`reconnect-storm.js`). `run-instances.mjs` starts 1–3 API processes on one
  Postgres and Redis; k6 picks the instance per virtual user, so no load balancer is involved.
  `sample-metrics.mjs` records each instance's `/metrics` (ADR-0031) to CSV.
- **Data:** `apps/api/test/loadtest/seed.ts` builds a separate database `ping_load` (dev data is untouched):
  5,000 users, one server, 50 channels, 3 million messages with skewed channel sizes and time-ordered UUIDv7 ids,
  inserted with batched `unnest` statements (3 M rows in ~95 s). JWTs are pre-signed (6 h) so the test does not
  measure argon2 password hashing.
- **No "disable rate limit" switch in the code.** The instances run with `TRUST_PROXY=1` and every virtual user
  sends its own `X-Forwarded-For`, so per-IP limits do not distort the measurement and nothing that could be
  switched on in production was added.
- **Not in CI.** It is heavy and unstable on shared runners; it is run by hand (`docs/perf/README.md`) when the hot
  path changes and before a release. Reports live in `docs/perf/`.
- **Findings are reported, not silently fixed.** The first report (`docs/perf/2026-10-20-baseline.md`) lists the
  bottlenecks with evidence and a proposal each. Fixing them is a separate decision with its own tests (and an ADR
  where the design changes, e.g. presence fan-out).

## Consequences

- A repeatable way to measure; the numbers from a laptop are host-bound and must not be quoted as production
  capacity. The same scripts run against staging by changing the ports/URLs.
- The first run already found one real defect (a presence failure disconnects a client that authenticated fine)
  and two scaling limits (presence broadcast cost, fixed Postgres pool). See the report for severity.
