# ADR-0018: Web authentication flow

Status: accepted
Date: 2026-10-20

## Decision

- Route groups: `(auth)` for `/login` and `/register`, `(app)` for everything that needs a
  session. `(app)/layout.tsx` wraps its children in `<Suspense>` + `AuthGate`.
- `AuthGate` is the single `use(browser())` boundary for the signed-in area, so components below it
  never render on the server and need no browser check of their own. It reads the session from the
  `me` query and redirects to `/login?next=<path>` when it is `null`.
- `getSession()` restores the session after a reload: no access token in memory → one
  `/auth/refresh` with the httpOnly cookie → `/users/me`; failure means "signed out" (`null`), not
  an error. `me` has `staleTime: Infinity`; login, register, logout and expired sessions update it.
- The api-client's unauthenticated handler (registered by `AuthGate`) only sets `me` to `null` when
  a refresh fails mid-session.
- Logout sets `me` to `null` first, then `AuthGate` removes every other query once it has stopped
  rendering the signed-in tree (`clearSessionQueries`). The removal must not happen while
  `AppShell` is still mounted: `removeQueries` on an active query makes its observers create it
  again and refetch, and `logout()` has already dropped the access token, so the request returns
  401, the refresh fails too (cookie revoked), and the error stays cached until the next session
  throws it through Suspense. Login and register clear the same queries before setting `me` so a
  new session never inherits the previous one's data or errors. `queryClient.clear()` is not used:
  it removes the `me` query itself, so `AuthGate`'s observer never learns about the logout (found
  while testing in the browser).
- **Amendment 2026-11-12:** `/auth/refresh` and `/auth/logout` are sent with `keepalive: true`.
  The server rotates the refresh token while answering, and a document navigation (F5, opening
  another URL) can abort the request after the rotation but before `Set-Cookie` reaches the cookie
  jar; the next document then presents the old token and is signed out. A refresh that loses an
  overlapping rotation (401, ADR-0007) is retried once after 200 ms so the winner's cookie can land,
  and a request that failed with an access token that another request had already replaced is
  resent with the newer in-memory token instead of rotating the refresh token again.
- `?next=` is only honored for same-origin paths (`/...`, not `//...` or `/\...`) to prevent open
  redirects. Forms validate with the shared zod schemas before calling the API; zod messages use
  its Vietnamese locale (`z.config(z.locales.vi())` in the root providers). Form errors are chosen
  by `ApiError.code`, never by the server's message.
- `experimental.instantInsights.validationLevel = 'manual-warning'`: Next's dev-only instant
  navigation check renders every page on the server by default and reports browser-only
  segments as errors. Segments opt in with `export const instant` when they can render instantly.

## Reason

The session exists only in the browser (in-memory token, API-scoped cookie), so route protection,
session restore and redirects all happen client-side (ADR-0015, ADR-0017).

## Alternatives considered

- `instant = false` on each layout — rejected: it does not cover pages below the layout, so every
  new page would need it.
- A form library — deferred: two forms with shared schemas do not justify a dependency.
- Zustand for auth state — not needed: "signed in" is server state in the `me` query.

## Consequences

Opening an `(app)` page shows a loading shell while the session is restored (one refresh request
per page load). New authenticated pages go under `(app)` and need nothing else to be protected.
