# Shared validation contracts

Status: accepted

## Decision

Keep reusable input schemas and their inferred TypeScript types in `@ping/shared`.
Use Zod 4 for runtime validation and tsup to emit ESM, CommonJS, and declarations
from `src/index.ts`. Declare public entry points through package exports.

## Reason

Frontend and backend should use the same validation rules and input types.
Providing both module formats allows ESM and CommonJS consumers to use the package
without publishing it to a registry.

## Consequences

Consumers must declare `@ping/shared` as a workspace dependency and build it before
importing its compiled entry points. A message nonce is validated as a UUID here;
actual retry deduplication must be implemented by the backend when messages are saved.
