# ADR-0024: Web realtime sessions, room acknowledgements and reconciliation

Status: accepted
Date: 2026-10-20

## Decision

- One typed Socket.IO client per authenticated UI, below `AuthGate`, using the API origin,
  WebSocket transport and an `auth` callback that reads the current in-memory access token.
  No connection starts during rendering. Effects own listeners, timers and disconnect cleanup.
- Authenticate in namespace middleware before exposing `connect`. This refines ADR-0006:
  verifying asynchronously in `handleConnection` let immediate room commands arrive before
  `userId` existed. Expiration still disconnects the socket at the JWT deadline.
- `channel.join` acknowledges `{ ok: true }` after authorization and joining; all invalid,
  unknown and forbidden channels receive the same `FORBIDDEN` result. New typed callers supply
  the ACK callback; legacy clients without one still work. Join/leave commands are serialized
  per socket in a WeakMap, outside serializable `socket.data`.
- A visible `MessagePane` owns its room subscription. Activity cleanup leaves it; showing the
  page again joins and reconciles through REST. Every reconnect rejoins active rooms before
  invalidating their message queries. Late ACKs are ignored using subscription generations.
- Transport failures use Socket.IO reconnection. A forced server disconnect refreshes once
  through the existing shared refresh promise, then explicitly connects. Temporary refresh
  failures retry with a delay; rejected sessions expire. A newly refreshed token rejected before
  connecting ends the session instead of causing a refresh loop. Logout invalidates pending
  refresh results, and stopped socket sessions cannot reconnect or apply pending event handlers.
- Domain hooks own all TanStack Query writes. Created events reuse nonce/id reconciliation;
  updates keep the newest edit. Deleted ids remain as tombstones in the channel query until its
  cache is removed, preventing late HTTP/create events from resurrecting deleted messages.
  REST refetch retains only unconfirmed local sends and tombstones. Events cancel overlapping
  fetches before updating cache, then restart an interrupted reconciliation.
- Reconnect invalidates server metadata as well as messages. REST membership checks detect kicks
  missed while offline. `permissions.changed` invalidates and rejoins; `member.removed` cancels
  requests and removes both server-prefixed queries and the separate channel-message keys.
  Visited ids supplement the channels query when finding message keys to remove.
- Zustand 5.0.8 stores connection/room ACK UI status and expiring typing leases, scoped to the signed-in
  provider and read through selectors. No persistence, auth, messages, members or permissions.
  Typing emits at most every 3 seconds and expires after 5 seconds; disconnected sockets do not
  buffer typing. UI uses existing semantic colors and vi/en messages.
- A denied join ACK hides the message UI immediately: background query errors intentionally
  retain cached data and cannot be relied upon to hide it. Granted access rejoins and reconciles.
  Session expiration clears private query cache through auth hooks, just like logout.

## Reason

Socket events can race with HTTP, refetches, route hiding and authentication. Explicit lifecycle
and join completion make reconciliation deterministic while keeping REST/Postgres authoritative.

## Alternatives considered

- Read the token only once, or rely solely on automatic reconnection — fails forced JWT-expiry
  disconnects and sends stale credentials.
- Delay before fetching/joining — rejected: database latency is not a fixed duration.
- Message/server data in Zustand — rejected by the existing server-state boundary.
- Presence/member UI in F5 — deferred by user choice; presence events have no initial snapshot.

## Consequences

F5 has a small backward-compatible backend protocol change and requires API e2e validation.
It adds no migration. Message editing/deletion controls and CASL UI remain F6. New-channel events,
durable event replay and presence snapshots are not part of the current shared protocol.
