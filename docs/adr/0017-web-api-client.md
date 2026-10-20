# ADR-0017: Web API client and client-only data fetching

Status: accepted
Date: 2026-10-20

## Decision

- `src/lib/api-client.ts` is the only way the web app calls the API. It adds
  `Authorization: Bearer`, sends `credentials: 'include'`, and turns every failure into `ApiError`
  (`status`, `code` from `ErrorCodes`, `message`, `requestId`, `details`). A network failure is
  `status 0`, `SERVICE_UNAVAILABLE`. Non-JSON errors map their status with `errorCodeForStatus`,
  now shared with the API's exception filter.
- The access token lives in a module variable, not in Zustand and never in `localStorage`. Whether
  the user is signed in is server state (`me` query, F2).
- On 401 outside `/auth/*`, the client refreshes once and retries once. Concurrent 401s share a
  single in-flight `/auth/refresh` (the API rotates refresh tokens, ADR-0007). If refresh fails, the
  token is cleared and the `setUnauthenticatedHandler` callback runs.
- TanStack Query: one browser `QueryClient` (new one per server render), `staleTime` 30s, no retry on
  4xx, at most 2 retries otherwise. All keys come from `src/lib/query-keys.ts`, nested so a
  server-level invalidation covers its channels, members and permissions.
- Components that call the API render behind `<Suspense>` and start with `use(browser(...))`
  (React 19.3) so they never fetch during server rendering, where neither the access token nor the
  user's cookies exist.
- The API exposes `X-Request-Id` through CORS (`exposedHeaders`) so the browser can read it.

## Reason

Every feature needs the same auth, retry and error behavior. Verified in the browser: without
`browser()`, `useSuspenseQuery` also ran during Next's server render and called the API from Node.

## Alternatives considered

- Access token in Zustand — rejected: nothing renders from the token itself; a module variable is
  reachable from non-React code without a store.
- A fetch wrapper library (ky, axios) — rejected: the logic is ~100 lines and fully tested.
- Refreshing proactively before expiry — deferred: refresh-on-401 is enough for the base.

## Consequences

`apps/web/.env.local` (from `.env.example`) is required to run `pnpm build`, mirroring the API's `.env`.
Forgetting `use(browser())` in a data component makes it fetch from the server and fail auth.
