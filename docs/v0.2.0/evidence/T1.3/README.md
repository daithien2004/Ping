# T1.3 — Outbox + port `EventBus`

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t1.3-outbox-eventbus`, base commit `9b38636`.
- Task: T1.3 (Pha 1).

## Thay đổi

- Migration `20261022060437_add_outbox_event`: bảng `OutboxEvent`.
- Schema Prisma: model `OutboxEvent` (id, aggregateType, aggregateId, type, payload, publishedAt, attempts, nextRetryAt, createdAt) + index.
- `apps/api/src/infra/events/event-bus.ts`: port `EventBus`.
- `apps/api/src/infra/events/outbox.service.ts`: `OutboxService.write(tx, event)` ghi outbox trong transaction.
- `apps/api/src/infra/events/outbox-relay.service.ts`: relay worker poll `FOR UPDATE`-style (findMany pending), publish lên Redis Stream `stream:outbox` (XADD), đánh dấu `publishedAt`, retry với backoff, metric `outbox_pending`/`outbox_lag_seconds`.
- `apps/api/src/infra/events/events.module.ts` + đăng ký trong `app.module.ts`.
- `MessagesService.create`: ghi message + outbox trong `$transaction`.
- `MessagesModule` import `EventsModule`.

## Kiểm chứng

| Tiêu chí      | Lệnh                          | Kết quả   |
| ------------- | ----------------------------- | --------- |
| Typecheck API | `pnpm --filter api typecheck` | pass      |
| Test API      | `pnpm --filter api test`      | pass (38) |
| E2E messages  | `messages.e2e-spec.ts`        | pass (9)  |
| Format        | `pnpm format:check`           | pass      |
| Docs links    | `pnpm docs:check`             | pass      |

## Giới hạn

- Consumer idempotent và kill-relay drill chưa có test tự động; relay là best-effort in-process. Worker riêng (T1.4) sẽ tách entrypoint.
- Chưa có test "kill relay giữa chừng không mất event"; sẽ thêm khi có staging/drill.
