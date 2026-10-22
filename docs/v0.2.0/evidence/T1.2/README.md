# T1.2 — Presence: baseline + ADR-0039 + cải đặt + đo lại

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t1.2-presence-batching`, base commit `6730aec`.
- Task: T1.2 (Pha 1).

## Thay đổi

- ADR-0039: `docs/adr/0039-presence-batching.md` (proposed).
- `apps/api/src/modules/realtime/realtime.gateway.ts`: gộp presence theo `serverId` trong cửa sổ
  `PRESENCE_BATCH_MS` (mặc định 1000 ms, 0 = phát ngay).
- `apps/api/src/config/env.schema.ts`: thêm `PRESENCE_BATCH_MS` (0–5000, mặc định 1000).
- `.env.example`: thêm `PRESENCE_BATCH_MS=1000`.
- `apps/api/vitest.config.e2e.ts`: đặt `PRESENCE_BATCH_MS=0` trong test để giữ hành vi tức thời.

## Kiểm chứng

| Tiêu chí      | Lệnh                                                  | Kết quả         |
| ------------- | ----------------------------------------------------- | --------------- |
| Typecheck API | `pnpm --filter api typecheck`                         | pass            |
| Test API      | `pnpm --filter api test`                              | pass (38)       |
| E2E realtime  | `members-presence`, `realtime`, `presence-resilience` | pass (17 tests) |
| Format        | `pnpm format:check`                                   | pass            |
| Docs links    | `pnpm docs:check`                                     | pass            |

## Giới hạn

- Chưa đo baseline 4,9 triệu event/90s và đo lại after; cần profile tải (T0.6-style) với PRESENCE_BATCH_MS=1000.
  Sẽ bổ sung số đo khi chạy staging/pilot. ADR ở trạng thái proposed, chờ OWNER duyệt.
