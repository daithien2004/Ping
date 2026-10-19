# ADR-0004: Role permission grants

Status: accepted
Date: 2026-10-19

## Decision

- A member who is neither the owner nor an administrator may create, update, delete or assign a
  role only if that role's permission bits are a subset of their own effective permissions, and
  only with `MANAGE_ROLES`. Updating checks both the current and the new bits.
- Changing another member's roles is allowed only if that member's effective permissions are a
  subset of the actor's. Only the owner may change the owner's roles.
- The rules live in `@ping/shared` as `canManagePermissions` and `canManageMember`, next to
  `defineAbilityFor`. CASL conditions cannot express "subset of a bitmask".
- `AbilityGuard` fails closed: a route marked `@CheckAbility` whose server cannot be resolved is
  rejected. `roleId` route params are resolved to their server.
- `@everyone` permissions always count toward a member's effective permissions, even if the
  `MemberRole` row is missing; assigning roles never removes the `@everyone` row.

## Reason

`@CheckAbility(['manage', 'Role'])` only proved the caller had `MANAGE_ROLES`. A role manager could
create a role with `ADMINISTRATOR` and assign it to themselves, or strip roles from stronger
members. Separately, `/roles/:roleId` routes had no server in the URL, so the guard skipped every
check and any signed-in user could edit any server's roles.

## Alternatives considered

- Discord-style role hierarchy by `position` — deferred: positions are not yet maintained
  consistently, and the subset rule already blocks escalation without new UI concepts.
- Checking only the new permissions on update — rejected: a manager could then rename or weaken
  an administrator role they could never have created.

## Consequences

Role managers see 403 when touching anything stronger than themselves. Owners and administrators
keep full control. New route params that identify server-scoped resources must be added to
`AbilityGuard.resolveServerId`, or their routes will be rejected.
