# ADR-0028: API conventions

Status: accepted
Date: 2026-10-20

## Decision

- **`docs/api-conventions.md` is the reference, `test/api-conventions.e2e-spec.ts` is the enforcement.**
  The test boots the real app and measures: error body (`code` in `ErrorCodes`, `requestId` equal to
  `X-Request-Id`, no stack, `details` only for validation), the status/code pairs, camelCase keys, ISO
  8601 UTC dates, UUID ids, decimal-string bigints, status per operation, the 403/404 policy and cursor
  pagination. It ran first against the existing API; its findings were fixed.
- **Fixed after the audit:**
  - `GET /servers/:id/members` returned an unbounded array. It is now `{ members, hasMore }` with
    `after`/`limit` (keyset on the member id, UUIDv7, same order as `joinedAt`), backed by
    `Member(serverId, id)` (plain `CREATE INDEX`: the table is small; for a large table the guide's
    separate `CONCURRENTLY` migration applies). Nothing in the web used the endpoint yet, so the
    breaking change cost nothing.
  - Prisma's `_count` leaked into responses; replaced by `memberCount` and `channelCount`.
  - body-parser errors (malformed JSON, 413) ran before the request-id middleware and returned
    `requestId: "unknown"` and no header. `assignRequestId` now runs first in `configureApp()`.
  - Client event `typing` is now `typing.start` (`domain.action`). During a rolling deploy an old web
    build emitting `typing` is ignored: no typing indicator for a few minutes, nothing breaks.
- **Caps** (`Limits` in shared): 200 channels and 100 roles per server, 100 servers per user. Over the
  cap: `400 VALIDATION_ERROR` with `details[0] = { path, code: "too_big" }`. Channel cap is exact (counted
  inside the existing advisory lock); role and server caps are soft.
- **Error catalog kept at nine codes.** The web already tells apart wrong credentials from an expired
  session by call site. New codes are added only when status plus context cannot distinguish cases.
- **403/404 policy documented as measured**, not changed: unknown or foreign server is always 403;
  channel, message or role that exists nowhere is 404, one that exists but is not yours is 403.
- **DELETE:** resources answer `200 { id }`, relationship removal (leave, kick, sign-out) `204`.
- **Web:** `VALIDATION_ERROR` has its own message (before, it fell to the generic one), which also
  covers reaching a cap.

## Reason

Conventions that are only written down drift. Measuring the running API found four real deviations
in minutes. Doing the pagination change now, before the members UI exists, avoids a breaking change
later.

## Alternatives considered

- Finer error codes (`INVALID_CREDENTIALS`, `LIMIT_REACHED`): rejected for now, no client needs them.
- 409 for caps: rejected, the join dialog maps `CONFLICT` to "already a member" and would mislead.
- 404 for every inaccessible resource: rejected, ids are unguessable and the guard resolves the owning
  server first; changing it would touch every guard for little gain.
- Flattening `roles: [{ role }]` of a member (join-table shape): not done, it would touch many tests
  for no functional gain; it is documented as the current shape in `MemberDto`.
- OpenAPI generated from zod: out of scope, `/docs` stays a development aid.

## Consequences

Adding an endpoint now includes rows in the conformance and IDOR tests. The caps are product limits
chosen here and can be changed in `Limits`. Concurrent creation can exceed the role and server caps by
a few units.
