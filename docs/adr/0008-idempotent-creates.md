# ADR-0008: Idempotent create endpoints

Status: accepted
Date: 2026-10-19

## Decision

- Messages stay idempotent through the client `nonce` and the unique index
  `(channelId, authorId, nonce)`.
- Other create endpoints (`POST /servers`, `POST /servers/:id/channels`, `POST /servers/:id/roles`)
  accept an optional `Idempotency-Key` header (UUID). `IdempotencyInterceptor` stores the first
  response body in Redis for 24 hours, keyed by user, method, URL and key, and replays it for
  retries. A retry while the first request is still running gets 409; a failed request releases
  the key.
- Joining a server is naturally idempotent: a second join returns 409, including under races.
- Channel `position` is assigned as `max + 1` under a per-server advisory lock.

## Reason

CLAUDE.md rule 12 requires retry-safe creates. Adding a nonce column to every table would need a
migration and a unique index per resource; a header-based interceptor covers any create route.

## Alternatives considered

- Per-table nonce columns like messages — rejected: schema churn for resources created rarely.
- Storing idempotency records in Postgres — rejected: they are short-lived and Redis already
  holds rate-limit and cache state of the same kind.

## Consequences

Clients that retry creates must send the same `Idempotency-Key`. Replayed responses are the
JSON-serialized first response. Redis loss forgets keys; a retry after that creates a duplicate.
