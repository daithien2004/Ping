# Ping

## Toolchain

- Node.js: `24.22.0` (LTS)
- pnpm: `10.26.0`
- TypeScript: `6.0.3`

On Windows with nvm-windows:

```powershell
nvm install 24.22.0
nvm use 24.22.0
pnpm install --frozen-lockfile
```

Use the same Node.js and pnpm versions in CI and deployment. Install pnpm `10.26.0`
if it is not available after switching Node.js versions. External dependencies are
pinned to exact versions; commit `pnpm-lock.yaml` with any dependency updates.

See [the version policy](docs/adr/0001-dependency-versions.md).
