# ADR-0016: Personal permission and membership events

Status: accepted
Date: 2026-10-19

## Decision

- `GET /api/v1/servers/:serverId/me/permissions` returns the caller's effective permissions as
  `MyServerPermissions` (`{ isOwner, permissions }`, permissions as a decimal string), computed by
  `AbilityFactory.contextFor`. The web app builds its CASL ability from it with the same
  `defineAbilityFor` as the API.
- Two socket events, sent only to the affected user's `user:<id>` room:
  - `permissions.changed { serverId }` — after a role is edited or deleted (every member of the
    server) or after the user's roles are reassigned.
  - `member.removed { serverId }` — after the user leaves, is kicked, or the server is deleted.
- Both are emitted by `RealtimeService.refreshAccess` (and `notifyServerDeleted`), which already
  runs after every change that can reduce access, so no call site needs new code.

## Reason

The web app hides controls the user cannot use and must react when access changes while it is
open (ADR-0014 left kicked users without any signal).

## Alternatives considered

- Polling permissions — rejected: delays and wasted requests for something that rarely changes.
- Broadcasting role changes to the server room with the new bitmask — rejected: each member's
  effective permissions differ; a per-user nudge to refetch keeps the computation server-side.
- Computing exactly which members' permissions changed — deferred: role edits are rare, and a
  refetch of one small endpoint per member is cheap.

## Consequences

Clients must treat `permissions.changed` as "refetch", not as a diff. Members get a nudge even
when an edit did not change their effective permissions.
