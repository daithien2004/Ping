# ADR-0027: Web and API hardening (CSRF, lockout, flood limits, CSP)

Status: accepted
Date: 2026-10-20

## Decision

- **IDOR suite.** `test/idor.e2e-spec.ts` attacks all 19 endpoints that take an id as an outsider,
  as the owner of another server (including cross-server id mixing) and as a plain member. Each
  attack must be rejected (403/404, or 400 for validated cross-server ids), leak nothing from the
  victim server and leave it unchanged. Adding an endpoint with an id means adding rows there.
- **CSRF on cookie endpoints.** `CsrfGuard` on `/auth/refresh` and `/auth/logout`: `Origin` must equal
  `WEB_ORIGIN` and header `X-Ping-Client: web` (constants in `@ping/shared`; the web `api-client`
  sends it). The cookie stays `SameSite=Lax`. A custom header forces a CORS preflight, which the API
  only grants to `WEB_ORIGIN`.
- **Logs.** `res.headers["set-cookie"]` is redacted in the access log (known-issues O2); the test runs
  real `pino-http` against a real HTTP server.
- **HTTP configuration in one place.** `configureApp()` (helmet, 32 KB JSON limit, cookie parser,
  CORS, prefix) is used by `main.ts` and by the e2e helper so tests run the production configuration.
  Express middleware client errors (body too large, malformed JSON) answer 413/400 instead of 500.
- **Password guessing.** `LoginAttemptsService` (Redis, keys use SHA-256 of email/IP): 5 failures for
  an (email, IP) pair or 20 for an email lock sign-in for up to 15 minutes with 429 and
  `Retry-After`. Counted for unknown emails too, so responses never reveal which emails exist. Checked
  before password hashing. Cleared on success. Redis down: sign-in is refused (fail-closed, ADR-0026).
- **Message flood.** 10 messages per 10 seconds per user per channel (`MessageRateLimiter`, reusing
  `RedisThrottlerStorage`), inside the service because the global throttler runs before
  authentication. Redis down: allowed (fail-open).
- **Sockets.** Per socket: 20 events/s are processed, beyond that ignored, beyond 60/s the socket is
  disconnected (counter lives in `socket.data`, it belongs to one live connection); at most 10
  sockets per user across instances; `maxHttpBufferSize` 16 KB.
- **Web headers.** `next.config.ts` sets CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, and HSTS in production. CSP has no wildcard, `connect-src`
  is `'self'` plus the API origin and its `ws(s)` twin, `frame-ancestors 'none'`,
  `upgrade-insecure-requests` only for an https API.
- **CSP without nonces.** Nonces require dynamic rendering of every page (Next 16 guide), which
  conflicts with `cacheComponents` and its prerendered shell, and SRI-based CSP is experimental. So
  `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` in dev only).
- **zod without JIT.** zod 4 probes `new Function('')` when the first schema is created, which is a
  CSP violation report without `'unsafe-eval'`. `zod/v4/core` `config({ jitless: true })` runs from
  `instrumentation-client.ts`, before any app module. Setting it in a component or in a normal module
  was too late (found by loading the production build under the CSP and recording violations).
- **Threat model** in `docs/security/threat-model.md`.

## Reason

Every measure answers a concrete abuse path listed in the threat model and is covered by a test that
fails when the measure is removed (checked by temporarily removing each one). The CSP was verified on
a production build, where `'unsafe-eval'` is absent: the full web e2e suite passes with zero
`securitypolicyviolation` events.

## Alternatives considered

- Nonce-based CSP: rejected (dynamic rendering), see above.
- Only `Origin` for CSRF: rejected, non-browser clients omit it and some proxies strip it; the header
  makes the check explicit. Only the header: rejected, `Origin` is the stronger signal.
- Lockout per email only: rejected, trivial account lockout by anyone; per (email, IP) keeps the
  real user working from their own IP. The 20-per-email cap remains a known denial-of-service
  trade-off (15 minutes).
- Message limits in the global throttler: rejected, it cannot know the user or channel.

## Consequences

Anyone can lock a known email for 15 minutes with 20 wrong attempts. Native/mobile clients must send
`Origin` and `X-Ping-Client`. A script already injected into a page is not stopped by CSP
(`'unsafe-inline'`); user content is never rendered as HTML, which e2e checks. `gitleaks`, dependency
and image scanning belong to the CI work.
