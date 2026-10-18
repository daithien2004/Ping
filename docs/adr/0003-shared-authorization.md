# ADR-0003: Shared authorization rules

Status: accepted
Date: 2026-10-18

## Decision

Use permission bitfields to represent role grants and CASL to evaluate actions.
Keep `defineAbilityFor` in `@ping/shared` so API and web use the same rules.
Build an ability for one authenticated, verified member of one server at a time.

Owners and administrators can manage all subjects. Members can update and delete
their own messages. Message managers can delete other authors' messages but cannot
edit them. Other management grants apply only to their corresponding subjects.

## Reason

Bitfields alone cannot express ownership conditions. Centralized CASL rules avoid
duplicating conditional authorization logic between API handlers and UI components.
MongoAbility supports object conditions without requiring a MongoDB database.

## Alternatives considered

- Check bitfields inline in each handler (`if (permissions & FLAG)` everywhere) —
  rejected: ownership conditions (edit only your own message) do not fit bitfields,
  and scattered checks drift between API handlers and UI.
- Express all rules as CASL string permissions instead of bitfields — rejected:
  grants stay in the `Role` table as one compact integer (Discord-style); CASL is
  kept purely as the evaluation layer on top.
- Translate CASL rules into Prisma queries with `@casl/prisma` — deferred: it couples
  tightly to the Prisma version; list queries must constrain `serverId`/`channelId`
  manually until read rules grow per-channel complexity.
- Extend `AbilityContext` with per-channel overrides — deferred: private channels are
  out of scope for the base (guide section 10.2).

## Consequences

Backend callers must verify membership and resource ownership by server before
checking an ability. Channel-specific restrictions require separate checks or
future rule extensions. UI checks do not replace backend authorization.
Use `subject('Message', message)` for ownership checks against a concrete message;
checking only the string `'Message'` does not validate its author.
