# ADR-0021: Web guardrails — e2e, import boundaries, typecheck on commit

Status: accepted
Date: 2026-10-20

## Decision

- **Playwright e2e** (`@playwright/test` 1.63.0, Chromium) in `apps/web/e2e`, run with
  `pnpm --filter web test:e2e`. It runs against the real stack (needs Docker) and reuses running dev
  servers, otherwise starts them. `globalSetup` creates its own user, server and a `#long` channel
  with 300 messages (via `seed-messages.ts`), so it never touches dev data. It is not part of
  `pnpm test` because it needs infrastructure.
- Scenarios: register → create server → create channel → sign out (no `?next=`, no leftover DOM of
  the previous user) → sign in (no password left in hidden forms); and the six F4 message scenarios.
  The retry scenario lets the POST reach the server and then fails it in the browser
  (`route.fetch()` + `route.abort()`), which is the case the nonce exists for.
- Tests run serially on one page per flow (`workers: 1`): the API limits 100 requests/minute/IP and
  each app load costs about six requests. A full run uses roughly 50.
- **ESLint `no-restricted-imports`** (built-in, no plugin): `useParams` is banned except in the three
  layout components; `components/` and `lib/` cannot import `features/`; nothing imports `app/`.
- **Pre-commit runs `pnpm typecheck`** in addition to lint-staged.
- A short "Frontend" section in the root `CLAUDE.md` records these rules.
- `useClearOnHide` resets the login and register forms when `<Activity>` hides them. The e2e run
  found both passwords still in the hidden DOM after signing in.

## Reason

Checks that a machine runs do not depend on anyone remembering them. The F2–F4 browser checks were
manual and would not have caught a regression during the upcoming UI rework (F4.5). Each rule here
answers a defect that actually happened (`useParams` in F4, the hidden password found by this e2e).

## Alternatives considered

- Claude Code hooks (format/lint after each edit, typecheck on stop), project skills and subagents —
  deferred: lint-staged and the existing workflow already cover them; add when a repeated problem
  shows up.
- Splitting `CLAUDE.md` per app — deferred until the root file nears 200 lines (79 now).
- CI on GitHub Actions — deferred until the branch is pushed; hooks only protect this machine.
- Logging in through a saved `storageState` — rejected: refresh tokens rotate, a reused cookie would
  be treated as token reuse.

## Consequences

Running the e2e suite twice within a minute can approach the rate limit. A UI change now needs its
Playwright scenario updated. Raw color classes and i18n key checks are added with F4.5.
