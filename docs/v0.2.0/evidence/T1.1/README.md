# T1.1 — `PG_POOL_MAX` có validation + tài liệu ngân sách kết nối

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t1.1-pg-pool-max`, base commit `314f89d`.
- Task: T1.1 trong `docs/v0.2.0/status.md` (Pha 1).

## Thay đổi

- `apps/api/src/config/env.schema.ts`: thêm `PG_POOL_MAX` (số nguyên 1–100, mặc định 10) với mô tả ngân sách.
- `apps/api/src/infra/prisma/prisma.service.ts`: truyền `max` vào `PrismaPg` từ `PG_POOL_MAX`.
- `.env.example`: thêm `PG_POOL_MAX=10`.
- Runbook: `docs/runbook/pool-budget.md`.

## Kiểm chứng

| Tiêu chí      | Lệnh                          | Kết quả         | Ghi chú |
| ------------- | ----------------------------- | --------------- | ------- |
| Typecheck API | `pnpm --filter api typecheck` | pass            | —       |
| Test API      | `pnpm --filter api test`      | pass (38 tests) | —       |
| Format        | `pnpm format:check`           | pass            | —       |
| Docs links    | `pnpm docs:check`             | pass            | —       |

## Ngân sách

`instance_count × PG_POOL_MAX ≤ max_connections − dự phòng (≥ 5)`. Xem `docs/runbook/pool-budget.md`.

## Giới hạn

- Chưa đo before/after pool exhaustion; chỉ cấu hình + validation. Đo thực tế khi có staging.
