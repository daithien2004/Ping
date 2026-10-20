# ADR-0019: App shell, routes and error regions

Status: accepted
Date: 2026-10-20

## Decision

- Routes under `(app)`: `/` (go to the first server, or an empty state), `/servers/[serverId]`
  (go to the first channel) and `/servers/[serverId]/channels/[channelId]`. Client components read
  ids with `useParams()`; the whole area is browser-only under `AuthGate` (ADR-0018).
- Layout: `(app)/layout.tsx` holds the server rail; `servers/[serverId]/layout.tsx` holds the channel
  sidebar. Each region has its own `<Suspense>` so loading one never blanks the others.
- One `(app)/error.tsx` handles errors of the content area (sidebar + channel). It sits at the
  `(app)` level because `error.tsx` does not catch errors in the `layout.tsx` of its own segment,
  where the sidebar lives. The server rail stays usable. Its retry calls TanStack Query's
  `useQueryErrorResetBoundary().reset()` before Next 16's `retry()`, otherwise the cached query
  error is thrown again.
- Cache updates after mutations: create server writes the returned server and its channels into
  the cache and navigates to `#general`; join and leave invalidate the server list; leave removes
  every query under `qk.server(id)`; create channel appends to `qk.channels(id)`.
- Dialogs use the native `<dialog>` element (`showModal()` gives Esc, focus containment, backdrop
  and dialog semantics). Icon-only buttons carry `aria-label`.
- UI text comes from `ErrorCode` via `lib/error-message.ts`, never from the server's message (which
  is English and may change); call sites pass context-specific overrides.
- Signing out on purpose redirects to `/login` without `?next=`, so the next person on the same
  browser is not sent to (or shown the id of) the previous user's page. An expired session still
  keeps `?next=`.
- `joinServerSchema` and the server/channel response types (`ServerSummary`, `ServerDetail`,
  `ChannelDto`, `RoleDto`, `JoinServerResponse`) live in `@ping/shared`.

## Reason

The shell must stay navigable while parts of it load or fail, and errors must be readable to a
Vietnamese-speaking user regardless of how the API phrases them.

## Alternatives considered

- `error.tsx` inside `servers/[serverId]` — rejected: it would not catch the sidebar's errors.
- `catchError` from `next/error` around the sidebar — deferred: one file-convention boundary covers
  the case.
- Showing the server's `message` for 400 errors — rejected after testing: it surfaced English text.

## Consequences

The "create channel" button is visible to everyone until F6 hides it by permission; a 403 shows a
message. Changes made by others (kick, new channels) appear only after a refetch until realtime
(F5) updates the cache.
