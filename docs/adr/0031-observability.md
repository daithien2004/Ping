# ADR-0031: Observability (metrics, error tracking, alerts)

Status: accepted
Date: 2026-10-20

## Decision

- **Metrics: Prometheus via `prom-client`, on a separate port.** `GET /metrics` is served by a tiny
  `node:http` server opened only when `METRICS_PORT` is set; the public port never exposes it (e2e
  asserts 404 there), so no auth scheme is needed: reach it through the internal network only. Each Nest
  instance owns its own `Registry` (two apps in one test process do not collide).
  - `http_request_duration_seconds{method,route,status_class}`: `route` is the matched **template**
    (`/api/v1/servers/:serverId`) or `unmatched`, never the real URL, so label cardinality is bounded
    (mutation-tested: using the URL fails the e2e).
  - `ws_connections`, `ws_disconnects_total`: incremented in `handleConnection`, decremented in
    `handleDisconnect`; every socket passes through both, including the ones refused early.
  - `dependency_up{name="postgres|redis"}`: measured at scrape time (Postgres `SELECT 1` under the
    query timeout, Redis `ping` unless the provider already knows it is down), so a dead dependency
    cannot make the scrape hang or fail.
  - Node defaults (`collectDefaultMetrics`: event loop lag, heap, GC).
- **Sentry, off unless a DSN is set.** API: `SENTRY_DSN`; web: `NEXT_PUBLIC_SENTRY_DSN`. Empty means the SDK
  is not initialised (API) or not even downloaded (web: dynamic `import()`, its own ~134 KB gzip chunk).
  Tracing is 0, no Session Replay, breadcrumbs disabled on web.
  - What is reported: the API reports **unexpected** 500s only (bugs); 4xx and deliberate 503 (outages)
    are for metrics and alerts. The web reports from `reportError()` (error boundaries) and uncaught
    errors. Each event carries the tag `requestId`, the same id as the response body, the
    `X-Request-Id` header and the log lines (`test/error-tracking.e2e-spec.ts`).
  - What is never sent (rule 11): request body, cookies, headers, query string, breadcrumbs, user other
    than the id. Both sides scrub in `beforeSend` (`scrubEvent`, `scrubBrowserEvent`, unit-tested with a
    secret-laden event).
  - CSP (ADR-0027): `connect-src` gains the DSN's origin **only** when a DSN is set at build time. Checked
    on a production build with a fake DSN: no CSP violation, the SDK posts envelopes to the allowed host.
- **Alerts are defined, not hosted.** `ops/alerts.yml` (5xx ratio, Postgres down, Redis down, socket drop
  spike, instance down) and `docs/runbook/alerts.md`. Standing up Prometheus/Alertmanager and creating
  the Sentry project are operator tasks. `promtool check rules` joins CI in H6.
- **Bundle budget.** The Sentry chunk is lazy, so it is excluded from the initial total and has its own
  cap (160 KB) in `check:bundle`; the initial JS stays 389 KB.

## Not done

- OpenTelemetry tracing: Sentry + `requestId` meet the exit criterion for a single service. Revisit when a
  second service exists.
- Server-side (RSC/Node) Sentry for the Next app: the web server renders no private data and all
  errors that matter occur in the browser or the API.
- Log aggregation (Loki/ELK): logs are structured JSON on stdout; shipping them is infrastructure.
