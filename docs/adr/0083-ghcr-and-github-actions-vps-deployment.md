# ADR-0083: Deploy immutable GHCR images to one VPS

## Decision

- After CI succeeds on a push to `main`, build and publish the API, migration, and web images to GHCR with the tested commit SHA as the tag.
- Keep runtime secrets in `/opt/ping/.env.prod` on the VPS. Generate them once during bootstrap; do not put them in GitHub or rewrite them at each deploy.
- Pin the running release in `images.env`. Deploy and manual rollback select a commit SHA; a failed healthcheck restores the previous tag.
- Restrict the GitHub SSH key with an OpenSSH forced command that accepts only configuration upload, deployment, and status requests. Pass the workflow's short-lived `GITHUB_TOKEN` to GHCR login over stdin and keep Docker credentials in a temporary directory.
- Keep Nginx as reverse proxy. Use Certbot standalone for certificate issuance/renewal, with hooks that stop Nginx for HTTP-01 and start it again after renewal.
- Start with a Let's Encrypt short-lived IP certificate for `20.193.75.48`; when a DNS name is available, update the public origin and issue a domain certificate.
- Keep Postgres data and uploads in named volumes; create daily local backups and require an off-host copy for recovery.

## Context

The repository has separate API, migration, and web images, a production Compose stack, and Postgres/Redis/Qdrant/upload volumes. A single VPS deployment should reuse the existing stack while limiting CI's SSH capabilities and keeping app secrets under the VPS operator's control.

## Consequences

- CI is the gate before publishing. `IMAGE_TAG` identifies the tested revision; the previous SHA remains selectable for rollback.
- GitHub stores only the VPS host, restricted SSH key, and verified host key. `GITHUB_TOKEN` grants package read access for the duration of a deploy.
- `PRODUCTION_URL` is a repository variable because Next.js embeds it in the web bundle. It must match `PUBLIC_URL` generated in the VPS env file.
- The VPS owns `.env.prod`, TLS certificates, Docker volumes, and local backups. `.env.prod` is mode `0600`; backup files are also private.
- Compose runs the separate migration service before API/worker become ready. Database changes still follow expand/contract compatibility rules.
- Nginx does not issue certificates. Certbot owns issuance/renewal, briefly stopping the proxy for standalone HTTP validation.
- IP certificates are valid for about six days and rely on Certbot's renewal timer and Nginx reload hooks; domain certificates can replace them without changing the CI image flow.
- This is a single-host deployment with brief service interruption during rollout. Local backups still require off-host replication.

## Alternatives considered

- Build on the VPS: requires source/build tools on the production host and spends VPS resources during deploy.
- Public GHCR images or a long-lived PAT on the VPS: simpler pulls, but expose images or leave a durable registry credential.
- Caddy instead of Nginx: automates certificate issuance, but changes the selected reverse proxy. Nginx remains and Certbot supplies its TLS lifecycle.
