# ADR-0036: Local deployment practice with Docker Desktop

Status: accepted
Date: 2026-10-21

## Decision

- Use the existing `pingprod` Compose project on Windows Docker Desktop, on loopback ports 8080/8443,
  to practise running the production builds. Keep it separate from the `ping` dev project.
- Keep env, CA, server keys and backups under `%LOCALAPPDATA%/Ping/local-deploy`, outside the repo.
  Reuse the original Postgres credentials for an existing `pingprod_pgdata` volume. No npm package
  is added; Node and the installed OpenSSL CLI generate certificates using a checked-in public config.
- Keep the local CA separate from the Nginx-mounted server directory. The helper preserves existing
  valid keys, refuses incomplete CA state, and renews the leaf only on explicit `--renew`.
  Trust-store installation/removal is a manual step performed by the owner, not by the helper.
- `docker-compose.local.yml` assigns explicit API/web/migrate image tags through `PING_RELEASE`.
  Rollback uses retained images with `--no-deps --no-build --pull never`, so it does not run migrations.
- On PowerShell, create binary dumps with `pg_dump -f` inside the container and transfer with
  `docker cp`. Restore into a new drill database; compare row counts and content fingerprints of
  the nine application tables plus migration metadata while API writes are stopped.
- Provide a dedicated Playwright configuration against the running HTTPS stack. It pins the local
  server key only for test Chromium; Node HTTP clients verify the local CA normally. It does not
  imply that the user's browser already trusts the CA.

## Reason

The owner wants to learn deployment without paying for cloud or installing a VM. Reusing the tested
Nginx/TLS stack provides a concrete starting point for running, inspecting, backing up and recovering
the application. Version tags make rollback steps explicit instead of rebuilding an old version.

## Consequences

- The local CA can issue trusted certificates after manual installation; protect its private key.
  It expires after one year; localhost leaf certificates expire after 90 days.
- This does not complete staging acceptance, configure a public domain, create automated/off-machine
  backups or operate monitoring. Those remain deployment-environment work.
- A practice rollback between two tags of the same source tests image selection, not compatibility
  across different API/web/schema releases. Production still requires expand/contract.
- The database fingerprint query is for small local drill databases; it is not a production integrity
  audit and must not be used unmodified on large tables.

## Instructions

See [local deployment runbook](../runbook/deploy.md), [Nginx](../../ops/nginx/README.md) and
[acceptance](../acceptance/v0.1.0.md) for evidence and work still pending.

## References

- [OpenSSL 1.1.1 req](https://docs.openssl.org/1.1.1/man1/req/)
- [OpenSSL 1.1.1 x509](https://docs.openssl.org/1.1.1/man1/x509/)
- [Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/)
- [PowerShell binary redirection](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection?view=powershell-7.4)
