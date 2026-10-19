# ADR-0015: Frontend architecture on Next.js 16

Status: accepted
Date: 2026-10-19

## Decision

- `apps/web` is a client-driven app on the App Router (Next.js 16.4, React 19.3) with
  `cacheComponents` enabled. Routes in `app/` only compose; logic lives in `features/<domain>`
  (`api`, `hooks`, `components`, `store`), shared code in `lib/` and `providers/`.
- Server state: TanStack Query, with one `QueryClient` per server render and one shared client in
  the browser (pattern from Next's bundled TanStack Query guide). UI-only state: Zustand. Server
  data is never copied into Zustand (rule 5).
- With `cacheComponents`, Next prerenders Client Components at build time, so any component
  that queries data or touches the socket during its first render sits behind `<Suspense>`.
  `pnpm build` is the check that catches violations.
- Navigation keeps recent routes mounted in a hidden React `<Activity>`: state survives, effects
  are cleaned up and re-run. Everything long-running (socket listeners, `channel.join`/`leave`,
  timers) must live in `useEffect` with cleanup.
- Route `params` are Promises (`PageProps<'/route'>`) in Server Components; Client Components
  use `useParams()`.
- Route protection happens on the client (an auth gate that refreshes the session on load).
  `proxy.ts` is not used: the refresh cookie belongs to the API origin and is scoped to
  `/api/v1/auth`, so the web server never sees it.
- Configuration: `NEXT_PUBLIC_API_URL` validated with zod in `src/lib/env.ts`; required in
  production, defaults to `http://localhost:4000` in development. Next reads `.env*` files from
  `apps/web`, documented in `apps/web/.env.example`.
- Dependencies are added in the phase that first uses them: TanStack Query (F1), Zustand (F2),
  TanStack Virtual (F4), `@casl/react` (F6). Styling stays on the existing Tailwind 4 setup.

## Reason

Next 16 changed defaults that tutorials predate (prerendering of Client Components, `<Activity>`
navigation, async params, `middleware` → `proxy`). Recording them keeps later phases consistent.

## Alternatives considered

- Server Components fetching through the API for the first paint — deferred: every request needs
  the in-memory access token, which only exists in the browser.
- `proxy.ts` redirects for unauthenticated users — rejected: the session cookie is not visible to
  the web origin.
- Disabling `cacheComponents` — rejected: it keeps navigation instant and the Suspense rule is
  easy to follow once known.
- A component library (shadcn/ui) — deferred: the base phase prioritizes architecture over looks.

## Consequences

First paint of app pages is a loading shell until the browser restores the session. Forgetting a
Suspense boundary fails the build rather than production.
