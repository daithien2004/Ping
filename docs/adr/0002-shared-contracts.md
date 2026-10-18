# ADR-0002: Shared validation contracts

Status: accepted
Date: 2026-10-18

## Decision

Keep reusable input schemas and their inferred TypeScript types in `@ping/shared`.
Use Zod 4 for runtime validation and tsup to emit ESM, CommonJS, and declarations
from `src/index.ts`. Declare public entry points through package exports.

## Reason

Frontend and backend should use the same validation rules and input types.
Providing both module formats allows ESM and CommonJS consumers to use the package
without publishing it to a registry.

## Alternatives considered

- Define schemas and types separately in each app — rejected: two sources of truth
  drift apart, and CLAUDE.md rule 4 forbids redefining shared types.
- Publish `@ping/shared` to a registry — rejected while the monorepo exists:
  `workspace:*` links give instant propagation with no publishing/versioning overhead;
  revisit if repositories are ever split.
- Generate types from OpenAPI/Swagger — rejected for the base: the contract also
  covers socket event names and permission flags, which OpenAPI does not describe,
  and zod yields both runtime validation and types from one source.

## Consequences

Consumers must declare `@ping/shared` as a workspace dependency and build it before
importing its compiled entry points. A message nonce is validated as a UUID here;
actual retry deduplication must be implemented by the backend when messages are saved.
