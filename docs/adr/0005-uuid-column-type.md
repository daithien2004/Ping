# ADR-0005: Native UUID columns for ids

Status: accepted
Date: 2026-10-19

## Decision

- Every primary key and foreign key is stored as Postgres `uuid` (`@db.Uuid`), still generated
  as UUIDv7 by Prisma Client.
- Route params named `*Id` must be UUIDs; a global `UuidParamsGuard` rejects others with
  400 `VALIDATION_ERROR` before any guard queries the database.
- Client-supplied keys that are not ids (`Message.nonce`, `Server.inviteCode`) stay `TEXT`.

## Reason

`TEXT` ids cost 36+ bytes instead of 16 in every row and in every index that contains them
(`Message` carries three), compare by collation instead of raw bytes, and accept any string.
The change is cheapest before production data exists.

## Alternatives considered

- Keep `TEXT` until tables grow — rejected: the migration only gets more expensive and would
  need an expand/contract rollout across every table.
- Let Prisma generate the migration — rejected: it drops and re-adds the columns, losing data.
  The migration is hand-written with `ALTER COLUMN ... TYPE uuid USING ...::uuid`.
- Validate ids with a pipe — rejected: pipes run after guards, and `AbilityGuard` already
  queries the database with these params, so a bad id would surface as a 500.

## Consequences

Raw SQL must insert valid UUIDs. Any new route param ending in `Id` is validated automatically;
an id param named differently is not.
