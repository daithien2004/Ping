# ADR-0014: Kicking members

Status: accepted
Date: 2026-10-19

## Decision

- `DELETE /api/v1/servers/:serverId/members/:memberId` removes a member (204).
- New permission bit `KICK_MEMBERS` (128) grants `delete Member` in `defineAbilityFor`; the guard
  checks it through `@CheckAbility(['delete', 'Member'])`.
- The service applies `canKickMember` (in `@ping/shared`): nobody kicks the owner or themselves
  (self-removal is `leave`, answered 400); owners and administrators kick anyone else; other
  kickers only members whose permissions are a subset of their own (same rule as ADR-0004).
- A `memberId` that belongs to another server returns 404, not 403, so ids of other servers are
  not confirmed to exist.
- The deletion and an `AuditLog` row (`MEMBER_KICK`, metadata `userId`) are written in one
  transaction; then the ability cache entry is invalidated and the user's sockets leave the
  server's rooms (ADR-0006).
- A kick is not a ban: the user can rejoin with an invite code.

## Reason

CLAUDE.md rule 11 and the base acceptance gate require kicking with an audit trail. Reusing the
subset rule keeps one notion of "stronger than me" across role management and moderation.

## Alternatives considered

- Reuse `MANAGE_ROLES` or `MANAGE_SERVER` for kicking — rejected: moderators should be able to
  remove members without being able to change permissions.
- Bans in the same change — deferred: needs a table and checks on join; not required by the base.

## Consequences

Kicked users get no dedicated socket event yet; their REST calls return 403 and they stop
receiving channel events. A `member.removed` event can be added when the web client needs it.
