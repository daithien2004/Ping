# ADR-0010: API request pipeline

Status: accepted
Date: 2026-10-19 (records decisions made on 2026-10-18)

## Decision

- Configuration is validated once at boot with a zod schema (`config/env.schema.ts`); a missing or
  malformed variable stops the process.
- Logging uses pino (`nestjs-pino`) as JSON. Each request gets a `requestId` (a client
  `X-Request-Id` is reused only if it is a UUID), which appears in every log line, in the
  `X-Request-Id` response header and in every error body. `nestjs-cls` makes it available outside
  the request object (e.g. `AuditService`). `LoggerModule` must be imported before `ClsModule`.
- Input validation uses `ZodValidationPipe` with schemas from `@ping/shared`, not
  `class-validator`. Route `*Id` params are validated by the global `UuidParamsGuard`.
- One global `AllExceptionsFilter` shapes every error as `ApiErrorBody`; stacks and internal
  messages never reach clients in production.
- Every route lives under `/api/v1`. Helmet, CORS for `WEB_ORIGIN` with credentials, and
  shutdown hooks are enabled in `main.ts`. Swagger is served at `/docs` outside production.

## Reason

Every module needs the same validation, logging and error contract; building them once before any
feature keeps controllers thin and responses uniform (CLAUDE.md rules 8, 10, 11).

## Alternatives considered

- `class-validator` DTOs — rejected: duplicates the zod schemas already shared with the web app.
- Nest's default logger — rejected: not structured, no request correlation, no redaction.
- Unversioned routes — rejected: `/v1` costs nothing now and allows a breaking `/v2` later.

## Consequences

e2e tests must reapply what `main.ts` does (prefix, cookie-parser, socket adapter) because only
`AppModule` is booted there.
