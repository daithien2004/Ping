# ADR-0001: Dependency and runtime versions

Status: accepted
Date: 2026-10-18

## Decision

- Use Node.js 24.22.0 LTS and pnpm 10.26.0 for development, CI, and deployment.
- Pin direct external dependencies to exact versions; retain `workspace:*` for internal packages.
- Use TypeScript 6.0.3 and Node.js type definitions 24.19.2 across the workspace.
- Keep the working NestJS 12.1.3, Next.js 16.4.2, and React 19.3.0 versions.
- Commit the root `pnpm-lock.yaml`; use `pnpm install --frozen-lockfile` in CI and deployment.
- Set `save-exact=true` for future installs and enforce the declared runtime with `engine-strict=true`.

## Reason

Unbounded `latest` versions previously installed incompatible TypeScript and ESLint releases.
Exact versions and the lockfile make upgrades deliberate and installations reproducible.
Node.js 24 is the LTS line; this patch updates the older local 24.15.0 runtime baseline.

## Alternatives considered

- Keep `latest` ranges for direct dependencies — rejected: unbounded installs already
  pulled incompatible TypeScript and ESLint releases once; upgrades must be deliberate.
- Rely on `.nvmrc` alone for the Node version — rejected on Windows, because
  nvm-windows does not consume `.nvmrc`; `engines` + `engine-strict` enforce it instead.
- Centralize versions with a pnpm catalog/overrides — deferred: only a handful of
  root-level tools exist today; revisit when version drift across packages appears.

## Consequences

Version bumps require updating manifests and the lockfile together, then running lint,
typecheck, tests, and production builds. Keep accepting reviewed security updates;
pinning versions does not mean freezing upgrades indefinitely.

On Windows, install and select Node.js explicitly with `nvm install 24.22.0` and
`nvm use 24.22.0`; nvm-windows does not automatically consume `.nvmrc`.
