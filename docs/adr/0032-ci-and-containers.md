# ADR-0032: CI and containers

Status: accepted
Date: 2026-10-20

## Decision

- **CI (`.github/workflows/ci.yml`)** runs on every PR and push to `main`. Jobs: `verify` (format, lint,
  typecheck, unit, build, bundle budget), `api-e2e` and `web-e2e` (Postgres 17 + Redis 7 service containers,
  migrations applied first; Playwright traces uploaded on failure), `migrations` (empty DB gets every
  migration, then `prisma migrate diff --exit-code` proves the schema in code equals the migrations),
  `drills` (the Redis/Postgres outage drills against real containers), `docker` (builds the production
  stack, smoke test through the proxy including a WebSocket, real SIGTERM, Trivy scan), `security`
  (`pnpm audit --prod` at high, gitleaks over the whole history, `promtool check rules`), `lighthouse`.
  - **Required checks (set in GitHub branch protection, which only the repository owner can do):**
    `verify`, `api-e2e`, `web-e2e`, `migrations`, `security`.
  - **Report-only for now:** `lighthouse` (thresholds need a few runs to settle) and the Trivy step
    (`continue-on-error`). Switch both to blocking once they are stable.
  - gitleaks flagged two false positives on its first run (a placeholder in `.env.prod.example`, a
    public badge token in the Nest README); `.gitleaks.toml` allows exactly those two paths with the reason.
- **Images.** `apps/api/Dockerfile` and `apps/web/Dockerfile`, built from the repo root: `turbo prune
--docker` → install (cached layer) → build → runner, non-root `node` user, `HEALTHCHECK`.
  - API: the `runner` target holds production dependencies and `dist` only (via `pnpm deploy --legacy
--prod`; `"files": ["dist"]` keeps sources and tests out). It is large (~660 MB, 496 MB of it
    `node_modules`; the Prisma CLI arrives as a dependency of `@prisma/client`). Acceptable for now;
    slimming is a possible later step, not a risk.
  - **Migrations are a separate `migrate` target** (build stage + Prisma CLI) run once per deploy before the
    API rolls out, never by each instance at boot (rule 13). In compose it is a service the API waits on
    with `service_completed_successfully`.
  - Web: Next `output: "standalone"`, enabled only when `NEXT_OUTPUT=standalone` (the Dockerfile sets it) so
    local `next start` keeps working. `NEXT_PUBLIC_*` values are baked in at build time, so changing the API
    URL means rebuilding the web image.
  - `prisma generate` reads `prisma7.config.ts`, which needs `DATABASE_URL` to exist; the build passes a dummy
    value to that one command only (not stored in the image).
- **Production stack example** (`docker-compose.prod.example.yml`, `ops/Caddyfile`, `.env.prod.example`):
  Caddy → web and api → Postgres and Redis, **one origin**: `/api/*` and `/socket.io/*` go to the API, the rest
  to the web. Same origin means the refresh cookie and the CSP (`connect-src 'self'`) work without CORS or
  subdomains. `TRUST_PROXY=1`, `SHUTDOWN_GRACE_MS=10000`, `stop_grace_period: 40s` (above grace + timeout so
  Docker never SIGKILLs mid-shutdown); `METRICS_PORT` is deliberately not set or published.
- **Verified locally** (not just written): both images build, the stack comes up, migration exits 0, and
  `apps/api/test/smoke/prod-stack.mjs` passes through Caddy (register, refresh cookie, create server,
  WebSocket, message plus realtime event, presence). `docker compose stop api` took 11.8 s and exited 0
  after logging "shutdown started: draining". Run the compose stack under its own project name (`-p
pingprod`): the default project name `ping` is the dev compose and would share its Postgres volume.

## Not done (deliberately deferred to just before v0.1.0)

- **Where it runs.** No host, domain, registry or Cloudflare setup yet; the CI builds images but does not push
  them. Before tagging v0.1.0 (gate H9): choose a host (a VPS with this compose file, or a container service),
  buy a domain, decide the registry (`ghcr.io` needs no extra account), add a push step for `main`/`v*` tags,
  write `docs/runbook/deploy.md` (build → migrate → roll out → check `/ready`, rollback, Postgres backups),
  and open the metrics port only on the internal network.
- **The workflows have not run on GitHub.** Syntax is checked with `actionlint`, and each job's commands were
  run locally (promtool, `migrate diff`, gitleaks, `pnpm audit`, the compose stack), except the Lighthouse job
  and the Trivy scan, which were not run here. Expect small first-run differences (versions of the
  Lighthouse CLI and Trivy are pinned from memory).
