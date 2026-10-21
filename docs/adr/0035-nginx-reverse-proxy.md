# ADR-0035: Nginx reverse proxy instead of Caddy

Status: accepted
Date: 2026-10-21
Supersedes: the reverse proxy choice in [ADR-0032](0032-ci-and-containers.md).

## Decision

- Use the official `nginx:1.30.6` image, pinned rather than `latest`, for the production example.
  The owner approved this change and the exception to the two-week release-age policy: 1.30.6 was
  released on 2026-10-14 with security fixes. No npm dependency is added.
- Keep one origin: `/api/*` and `/socket.io/*` go to API, everything else goes to web. Preserve the
  entire URI, support WebSocket upgrade explicitly, disable buffering for streamed web responses,
  and re-resolve Docker upstream names when containers change.
- Overwrite forwarded IP/protocol headers at the single trusted proxy. Only Nginx is published;
  API, Postgres and Redis remain internal. Access logs exclude URI/query, credentials and bodies,
  and use the upstream requestId when available.
- The base compose binds HTTP to loopback for local/CI testing. HTTPS is an explicit compose overlay
  with read-only external certificate files and an HTTP-to-HTTPS redirect. It requires Compose
  > = 2.24.4 (`!override`). No automatic certificate issuance is implied.
- Keep API body-size enforcement and its JSON error contract: proxying a 40 KB JSON body must return
  the API's 413 with requestId, not a proxy HTML error. Refresh/logout and CSRF pass through intact.
- CI tests HTTPS using a short-lived test certificate and an explicit trusted CA, including the
  redirect, Socket.IO, API errors and cookie refresh/logout. TLS verification is never disabled.

## Reason

The owner wants to learn and operate Nginx using the existing Docker deployment workflow. Routing
and TLS are explicit, and most of the deployment remains portable between local Docker, a VM and cloud.

## Alternatives considered

- Keep Caddy: simpler automatic TLS, but does not meet the owner's chosen proxy workflow.
- Nginx with bundled Certbot: adds certificate lifecycle and domain decisions before staging has
  been selected. Defer ACME automation until the deployment environment is known.

## Consequences

- Operators must provision, renew and reload certificates; HTTPS does not work without certificate
  files. See [proxy instructions](../../ops/nginx/README.md).
- Local smoke evidence is separate from staging acceptance. Existing Caddy performance reports
  remain historical evidence and are not relabelled as Nginx results.
- A changed proxy requires rebuilding the stack and rerunning `prod-stack.mjs` plus shutdown checks.

## References

- [Nginx release notes](https://nginx.org/2026.html)
- [WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
- [HTTPS configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)

## Verification (local, 2026-10-21)

- Format, lint, typecheck, unit tests (27 shared + 38 API + 91 web), build, docs links and bundle
  budget passed. API e2e: 145/145; web Playwright: 22/22.
- Rebuilt the `pingprod` stack: HTTP smoke and HTTPS smoke passed, including the 308 redirect,
  API JSON 400/413, requestId, CSRF rejection, login/refresh/logout, room ACK, message and presence.
  Node trusted the temporary CA via `NODE_EXTRA_CA_CERTS`; TLS verification remained enabled.
- Chromium additionally exercised HTTPS registration, Secure/HttpOnly cookie, server/message,
  reload-based refresh and logout/login with no page errors. Only the temporary certificate's
  public key was pinned for this browser run; this is not a test of a publicly trusted certificate.
- Recreated API while Nginx stayed up: readiness and realtime smoke recovered. SIGTERM exited 0.
- `actionlint` passed. Updated GitHub workflow has not run remotely (not pushed).
- Windows Playwright teardown waited on its spawned API watch process after all tests passed;
  cleaning up that specific process tree allowed Playwright to exit 0. This is recorded locally
  for follow-up. No staging/cloud deployment or performance claim is made by these checks.
