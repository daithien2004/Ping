# ADR-0025: Permissions in the web UI and message edit/delete

Status: accepted
Date: 2026-10-20

## Decision

- **One rule source.** The web builds its ability with `defineAbilityFor` from `@ping/shared`, fed by
  `GET /servers/:id/me/permissions` (`{ isOwner, permissions }`, bigint as decimal string). The
  response is validated with `myServerPermissionsSchema` (shared); a malformed response is an error,
  never "no permissions". No `if (role === …)` in components.
- **Missing data grants nothing.** `buildServerAbility(userId, undefined)` returns an empty ability.
  It must not call `defineAbilityFor` with `permissions = 0n`, because that grants own-message
  update/delete.
- **Scope = one server.** `ServerAbilityProvider` (in `servers/[serverId]/layout.tsx`, params from
  the layout props) is keyed by `serverId` and provides the ability through `@casl/react`
  (`AbilityProvider`, `Can`) and a `ready` flag. `ServerViewBoundary` hides the channel area when
  the member cannot `view` messages.
- **`ready` locks actions, not reading.** While permissions refetch (`isFetching`), buttons and the
  composer are disabled but the UI, drafts and open dialogs stay. Handlers re-check `ready` and
  `ability.can(...)` so a stale click cannot act. Dialogs for a message close when the permission to
  act on it disappears.
- **Message subject carries the author.** `messageSubject({ authorId })` = `subject('Message', …)`,
  so conditions like "own message" are evaluated by CASL.
- **Edit and delete** (menu = shadcn `DropdownMenu`, dialogs = app `Dialog`):
  `updateMessageSchema` moved to `@ping/shared` (API and web share the 1–4000 rule). Hooks go through
  `createMessageActions` (pure enough to unit test): the HTTP response and socket events converge on
  the same cache (`updateMessage`, `deleteMessage` with tombstones from ADR-0024). A lost response is
  resolved from what the socket already confirmed; 404 on delete means "already gone"; 403 marks the
  permission query stale and keeps the row.
- **Edit conflicts:** if the message changed elsewhere while the dialog is open, saving is blocked
  until the user loads the latest version.
- **Channel creation** is shown only with `can('create', 'Channel')`; the channel list only with
  `can('view', 'Channel')`.
- Dependencies: `@casl/react` 7.0.1 (already compatible with `@casl/ability` 7); `@casl/ability`
  7.0.2 is the version the API and shared already use.

## Reason

The server stays the authority (every endpoint checks CASL); the UI only mirrors it to avoid offering
actions that will fail. Sharing `defineAbilityFor` means a permission change is made once. Failing
closed on missing data and locking during refetch avoid both "flash of allowed" and losing user input.

## Alternatives considered

- Hand-written permission checks in the web — rejected (rule 9: rules only in `defineAbilityFor`).
- Unmounting UI while permissions refetch — rejected: it would drop drafts and open dialogs.
- Optimistic edit/delete — rejected for now: conflicts and permission loss make rollback costly; the
  response and socket event update the cache within one round trip.

## Consequences

Member and role management UI is not part of this phase. The permission query has `staleTime` 30s and
is also invalidated by `permissions.changed` and by a 403 from an action. An e2e (`permissions.spec.ts`)
covers menus per ownership, edit, delete with confirmation, and losing SEND_MESSAGES live.
