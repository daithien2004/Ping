# ADR-0009: Error code catalog and audit log

Status: accepted
Date: 2026-10-19

## Decision

### Error codes

- `ErrorCodes` in `@ping/shared` is the only source of error codes, with `ApiErrorBody`
  (`{ code, message, details?, requestId }`) as the error response type for clients.
- `AllExceptionsFilter` keeps a code only if it belongs to the catalog; any other code is replaced
  by the code mapped from the HTTP status. Unlisted 4xx statuses map to `BAD_REQUEST`, 5xx to
  `INTERNAL_ERROR`.
- Codes are generic for now (validation, auth, permission, not found, conflict, rate limit,
  unavailable, internal). Domain-specific codes are added to the catalog when a client needs to
  branch on them.

### Audit log

- `AuditLog` records role create/update/delete, member role changes, deleting another user's
  message, channel deletion and server deletion, with actor, target, metadata and `requestId`
  (from CLS, same id as logs and the `X-Request-Id` header).
- The audit row is written in the same transaction as the action it records.
- The table has no foreign keys: records must survive deletion of the server, role, channel or
  message they describe. Rows are append-only.

## Reason

CLAUDE.md rules 14 and 11. Error codes were free-form strings defined in several files, and none
of the sensitive actions left a trace.

## Alternatives considered

- Domain-specific codes for every failure — deferred: no client branches on them yet.
- Audit via logs only — rejected: logs are not queryable per server and are not kept with the
  data they describe.
- Foreign keys with `ON DELETE SET NULL` — rejected: deleting a server would erase which server
  the record belonged to.

## Consequences

New error codes must be added to `ErrorCodes` before use, or the filter replaces them. New
sensitive actions must call `AuditService.record` inside their transaction. There is no API to read
the audit log yet; it is queried from the database.
