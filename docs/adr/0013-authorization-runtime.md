# ADR-0013: Authorization at runtime

Status: accepted
Date: 2026-10-19 (records decisions made on 2026-10-18)

## Decision

- Two tiers. `AbilityGuard` checks by type before the controller: it resolves the server from
  `serverId`, `channelId`, `messageId` or `roleId`, rejects non-members with 403, and enforces
  `@CheckAbility([action, subject])`. Services check against the concrete object with
  `ForbiddenError.from(ability).throwUnlessCan(action, subject('Message', message))`, for rules
  that depend on it (authorship, role strength).
- `AbilityFactory` is the only place that builds an ability in the API: it loads membership and
  roles, ORs permissions (including `@everyone`) and calls `defineAbilityFor` from
  `@ping/shared` (ADR-0003).
- Ability contexts are cached in Redis for 30 seconds per (server, user). Every change to roles,
  role assignments or membership invalidates the cache, using `SCAN` for server-wide
  invalidation.
- Deleting a server is reserved for its owner and checked in the service, not as a role
  permission.

## Reason

Type-level checks belong before any work is done; ownership and object conditions can only be
checked once the object is loaded. Membership and role lookups would otherwise run on every
request.

## Alternatives considered

- `@casl/prisma` to turn rules into queries — deferred: couples tightly to the Prisma version;
  list queries constrain `serverId`/`channelId` explicitly (rule 9).
- No cache — rejected: every request would join three tables before reaching the controller.

## Consequences

A missed invalidation leaves stale permissions for at most 30 seconds. Socket rooms are not
covered by the cache and are revoked separately (ADR-0006).
