# ADR-0007: Auth token model

Status: accepted
Date: 2026-10-19

## Decision

- Access token: JWT signed with `JWT_ACCESS_SECRET`, 15 minutes, sent as `Authorization: Bearer`
  and kept in client memory. Verified without a database lookup.
- Refresh token: 48 random bytes, opaque (not a JWT), 30 days, sent only as an httpOnly,
  SameSite=Lax cookie scoped to `/api/v1/auth`. The `Session` table stores its SHA-256 hash.
- Every refresh rotates the token. Closing the old session is atomic
  (`updateMany ... where revokedAt is null`), so of two concurrent refreshes exactly one wins.
- A rotated token presented again within 10 seconds (`REFRESH_REUSE_GRACE_MS`) is treated as a
  concurrent refresh: 401 without side effects. Later than that it is treated as stolen and
  every live session of the user is revoked.
- Expired sessions of a user are deleted on each login. Revoked but unexpired sessions are kept
  so reuse can still be detected.
- Emails are trimmed and lower-cased in the shared schemas before validation.
- Login equalizes timing between unknown emails and wrong passwords. Register still answers 409
  for an existing email or username.
- Authentication is a plain guard calling `AuthService.verifyAccessToken`, not Passport, so the
  Socket.IO handshake reuses the same function.

## Reason

Short-lived JWTs keep request authentication cheap; opaque, hashed, rotating refresh tokens can
be revoked and make theft detectable. The grace window fixes users being logged out everywhere
when two tabs refreshed at the same moment.

## Alternatives considered

- Refresh token as a second JWT — rejected: needs its own secret and still requires a database
  row to revoke it.
- Hiding whether an email is registered on sign-up — rejected for now: a chat app must tell users
  their email or username is taken; login still does not leak it.
- A scheduled job for session cleanup — rejected: needs a scheduler dependency; per-user cleanup
  on login bounds the table well enough.

## Consequences

Clients should still run a single refresh at a time per tab. A stolen token reused within the
grace window is rejected but does not trigger revocation; the window is kept short for that reason.
Sockets disconnect when the access token expires (ADR-0006).
