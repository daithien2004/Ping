# ADR-0030: Member list and presence

Status: accepted
Date: 2026-10-20

## Decision

- **Presence is part of the members response, not a separate endpoint.** `GET /servers/:id/members`
  items carry `online: boolean` (additive, rolling-deploy safe). One page is at most 100 members, so
  `RealtimeService.onlineUserIds()` asks the Socket.IO adapter once for the sockets in the rooms
  `user:<id>` of that page and collects their `userId`s. The plan had a dedicated `/presence` endpoint;
  folding it into the page removes a second request, a second cache and any chance of the two
  disagreeing.
- **Source of truth is the open sockets**, same as the existing `presence.updated` broadcast (online on
  every connect, offline when the last socket of the user closes). No new Redis key.
- **Redis down:** only this instance's sockets are counted (`room.local`), never waits for the adapter
  (ADR-0026). Users connected elsewhere show offline until Redis returns: degraded, not an error.
  Covered in `redis-outage.e2e-spec.ts`.
- **Web:** `features/members/` — `useMembers` (infinite query, `after` cursor); `presence.updated`
  patches every cached members list through the pure `setPresence` (same object back when nothing
  changes); on reconnect (not the first connect) the members queries are invalidated to recover
  missed events. Panel open/closed is Zustand UI state (default open, not persisted). Online first,
  each group in server order. Colour comes from the `--online` token; the dot is decorative and a
  visually hidden text carries the status for screen readers. Axe covers the panel (open by default in
  `a11y.spec.ts`), `members.spec.ts` covers two sessions seeing each other go online and offline.

## Not done

- No "idle/away" status, no role colours, no member join/leave event (the list refreshes on mount and
  on reconnect). Presence events reach only sockets that joined a channel room, which is every user
  who is looking at a server.
