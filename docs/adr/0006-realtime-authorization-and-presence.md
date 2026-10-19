# ADR-0006: Realtime authorization and presence

Status: accepted
Date: 2026-10-19

## Decision

- Sockets authenticate once at handshake with the REST access token
  (`AuthService.verifyAccessToken`) and are disconnected when that token expires; clients refresh
  and reconnect.
- Rooms: `user:<id>` (every socket of a user), `server:<id>` (presence), `channel:<id>`
  (messages, typing). Joining a channel room requires `view Message` in that server.
- Permissions are checked only on join, so the API revokes rooms when access drops:
  `RealtimeService.refreshAccess` runs after a member leaves, a role changes or is deleted, and
  after role assignment. It removes channel rooms (and the server room for non-members) from the
  user's sockets on every instance.
- `typing` is relayed only from sockets already in the channel room, at most once per second per
  socket. Client payloads are parsed with `channelEventSchema` from `@ping/shared`.
- Presence: `online` is broadcast on every connection; `offline` when `fetchSockets()` on
  `user:<id>` across instances returns zero after a disconnect.
- The global HTTP throttler skips WebSocket contexts; socket rate limits live in the gateway.
- `message.created` carries `nonce` and the author's public profile.

## Reason

The first realtime version let members without `VIEW_CHANNEL` receive messages, kept sockets in
rooms after users left a server, relayed typing from anyone who knew a channel id, and counted
presence with a Redis counter whose TTL expired under long-lived connections.

## Alternatives considered

- Redis INCR/DECR connection counter with TTL — rejected: drifts when the TTL expires mid-session
  or an instance crashes; heartbeats would add moving parts.
- Re-checking permissions on every emit — rejected: room broadcasts cannot filter per recipient
  without fetching every socket.
- Revalidating only members holding the changed role — deferred: `refreshAccess` scans every
  member of the server, acceptable while servers are small.

## Consequences

Repeated `online` events are expected and must be treated as idempotent by clients. Users on a
crashed instance get no `offline` event until they reconnect elsewhere. `socket.data` must stay
JSON-serializable because other instances read it through `fetchSockets()`.
