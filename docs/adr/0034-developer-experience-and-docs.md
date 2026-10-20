# ADR-0034: Developer experience and documentation

Status: accepted
Date: 2026-10-20

## Decision

- **`pnpm bootstrap`** (`scripts/bootstrap.mjs`) takes a fresh clone to a running dev environment: checks the Node
  version against `.nvmrc`, pnpm and Docker, `pnpm install --frozen-lockfile`, creates `.env` from `.env.example`
  if missing, `docker compose up -d --wait`, builds `@ping/shared`, `prisma generate`, `migrate deploy`, seed. It is
  idempotent (an existing `.env` is kept; migrations and the seed are safe to repeat) and plain Node, so it behaves the
  same on Windows, macOS and Linux. It is **not** called `setup`: `pnpm setup` is a built-in pnpm command (it configures
  PATH), so a script of that name would never run via `pnpm setup`.
- **API e2e loads the root `.env` itself** (`vitest.config.e2e.ts`; variables already in the environment, as in CI,
  win). One spec reads `process.env.DATABASE_URL` directly and failed unless the shell had exported it; a new
  contributor would have hit that first.
- **Documentation set:** root `README` (what it is, diagram, one-command start, troubleshooting, commands),
  `docs/architecture.md` (flows written from the code, each linking its ADR), `apps/api` and `apps/web` READMEs
  (replacing the Nest/Next templates; env tables), `CONTRIBUTING.md` ("change X → run Y" table, review checklist,
  branch protection steps), PR template, `CODEOWNERS`, `.claude/commands/review.md` (review a diff against the CLAUDE.md
  rules), and new runbooks: trace by `requestId`, migrations, backup and restore, rollback, with an index.
- **Runbooks say what was actually run.** The backup commands were executed against the dev database (dump, restore into a
  new database, row counts equal); `migrate status` and `migrate diff` too. `migrate resolve`, `CREATE INDEX CONCURRENTLY`
  and the redeploy steps in `rollback.md` follow the tools' documentation and are marked as not exercised here.
- **Docs cannot rot silently:** `pnpm docs:check` (`scripts/check-doc-links.mjs`) fails on a broken relative Markdown link,
  and runs in the CI `verify` job. It checks files, not anchors or external URLs.
- **`CODEOWNERS` lists a single owner.** GitHub does not let an author approve their own PR, so "require review from code
  owners" on a one-maintainer repository would block every merge; `CONTRIBUTING.md` says to enable required reviews only
  with two or more people and to rely on green CI plus `/review` until then. Branch protection itself can only be set
  by the repository owner.

## Not done

- `docs/runbook/deploy.md` and scheduled backups: they depend on where it runs; to be written before `v0.1.0`
  ([ADR-0032](0032-ci-and-containers.md)).
- A `new-module` slash command: there is only one domain pattern worth extracting once a second module exists.
