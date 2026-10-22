# T1.4 — Tiến trình worker (entrypoint thứ hai)

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t1.4-worker-entrypoint`, base commit `e11beeb`.
- Task: T1.4 (Pha 1).

## Thay đổi

- `apps/api/src/worker.ts`: bootstrap `ApplicationContext` (không HTTP server), bật shutdown hooks; relay service chạy qua `onModuleInit`.
- `apps/api/package.json`: thêm script `start:worker` (`node dist/worker`).
- Build sinh `dist/worker.js`.

## Kiểm chứng

| Tiêu chí      | Lệnh                          | Kết quả                         |
| ------------- | ----------------------------- | ------------------------------- |
| Typecheck API | `pnpm --filter api typecheck` | pass                            |
| Build API     | `pnpm --filter api build`     | pass (`dist/worker.js` tồn tại) |
| Format        | `pnpm format:check`           | pass                            |

## Giới hạn

- Chưa chạy worker thật cùng API để kiểm tra duplicate relay; consumer idempotent theo `id` outbox. Drill sẽ làm ở T1.5/staging.
