# ADR-0020: Message list, optimistic send and virtualization

Status: accepted
Date: 2026-10-20

## Decision

- History is a TanStack infinite query under `qk.messages(channelId)`. Page 0 is the newest page;
  `fetchNextPage()` loads older messages with the `before` cursor (the id of the oldest message in
  the last page). The UI reverses the flattened pages (`oldestFirst`) to render oldest at the top.
  `MessageDto` and `MessagePage` live in `@ping/shared`.
- Cache helpers (`features/messages/message-cache.ts`, unit-tested) are pure and immutable:
  `upsertMessage` matches by `id` OR `nonce`, replaces in place (dropping duplicates), and otherwise
  inserts at the top of page 0; `markFailed` flags a message by nonce. F5's socket handler reuses
  `upsertMessage`, so the HTTP reply and the `message.created` event for the same message collapse
  into one row.
- Optimistic send: the composer generates one `nonce` per message. `onMutate` inserts a temporary
  message (`id = temp-<nonce>`, `status: 'sending'`), `onSuccess` upserts the server's message,
  `onError` marks it failed. "Retry" sends the same content with the same nonce; the server's
  `(channel, author, nonce)` dedup makes it safe, and the cache swaps the failed row in place.
- Virtualization with `@tanstack/react-virtual` (virtual-core 3.19): `getItemKey` is
  `nonce ?? id`, so confirming a message keeps the same row; `anchorTo: 'end'` keeps the visible
  message still when older pages are prepended; `followOnAppend` follows new messages only when the
  user is at the bottom. Sending your own message always scrolls to the bottom.
- First scroll to the newest message runs once, inside `requestAnimationFrame` that the effect
  cleanup cancels (StrictMode runs effects twice and detaches the virtualizer in between). Loading
  older pages is enabled only after that first scroll, otherwise item 0 is "visible" on the first
  render and an older page loads immediately.
- Pages read their route params from the page's `params` prop, not `useParams()`. With
  `cacheComponents`, `<Activity>` keeps previously visited pages hidden, and `useParams()` inside a
  hidden page returns the params of the CURRENT URL: the hidden `#general` page re-rendered as
  `#dev`, the `MessagePane` key changed and the draft and scroll position were lost. Layout-level
  components (server rail, channel sidebar) keep using `useParams()` since they should follow the
  URL. This refines ADR-0019.
- **Amendment 2026-11-06:** that exception holds only while the URL stays inside the segment. A
  layout under `servers/[serverId]` is also kept hidden when the user leaves for `/dms` or
  `/servers`, and there `useParams()` returns `serverId = undefined`: `ChannelSidebar` and
  `ChannelRedirect` fired `GET /servers/undefined` and `/servers/undefined/channels` (400) on every
  such navigation (found by manual testing). Components below the layout therefore take `serverId`
  from `ServerPermissionContext` (`useServerAbility()`), which is frozen from the layout's `params`
  prop. Only the server rail, which also renders outside a server, still uses `useParams()`
  (with `serverId` optional), plus the optional `channelId` highlight in `ChannelSidebar`.
- **Amendment 2026-11-12: scroll anchors and cancelled page loads.** `useMessageScroll` remembers,
  per channel, the first visible message and whether the user was at the bottom, and restores that
  anchor when the channel is reopened (a permalink's target message wins). `useChannelSync` cancels
  the messages query before patching missed messages on room join; with TanStack Query's default
  `revert: true`, a `fetchNextPage()` cancelled in flight **resolves** with the restored data
  instead of rejecting. Since `isFetchingNextPage` can flip inside one render, every dependency of
  the load-older effect may stay unchanged and the list would stay stuck at the top. The effect
  therefore also compares the page count before/after a resolved fetch and retries when no page was
  added; a rejecting `CancelledError` retries the same way. Covered by `e2e/messages.spec.ts` and
  reproduced by forcing the cancel in a microtask.
- `apps/api/prisma/seed-messages.ts` is a dev-only tool that writes N messages directly to the DB
  (the API's rate limit blocks bulk sends).

## Reason

A chat channel can hold thousands of messages; rendering only the visible rows keeps the DOM small
(about 10–20 rows). Optimistic sends make the UI feel instant while the nonce keeps retries and the
upcoming realtime events from creating duplicates.

## Alternatives considered

- Storing messages in Zustand — rejected: server state belongs in TanStack Query (rule 5).
- Hand-written scroll anchoring (measure `scrollHeight` before/after prepend) — rejected: virtual-core
  3.19 provides `anchorTo` and `followOnAppend`.
- Keeping drafts in a store per channel — not needed now: `<Activity>` keeps the page (and its draft)
  for the last 3 routes. A store may be added in F5 if drafts must survive eviction.

## Consequences

Drafts and scroll position survive switching between recently visited channels (up to 3 routes,
Next's limit); older routes re-render fresh. Measurements taken in a hidden browser pane are
unreliable because `requestAnimationFrame` is paused. New messages from others appear only after a
refetch until F5 writes socket events into the cache.
