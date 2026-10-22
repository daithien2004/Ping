# T1.6 — Sửa teardown e2e trên Windows

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t1.6-e2e-teardown-windows`, base commit `ea86322`.
- Task: T1.6 (Pha 1, [S]).

## Thay đổi

- `apps/web/playwright.config.ts`: thêm `gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }`
  cho cả hai `webServer` (API watch và web dev), để Playwright kill cây tiến trình bằng SIGTERM
  thay vì kill theo tên `node.exe` (ảnh hưởng ứng dụng khác).

## Kiểm chứng

| Tiêu chí   | Lệnh                | Kết quả |
| ---------- | ------------------- | ------- |
| Format     | `pnpm format:check` | pass    |
| Docs links | `pnpm docs:check`   | pass    |

## Giới hạn

- Chưa chạy full web e2e trên Windows để xác nhận teardown sạch; cần xác minh ở lần chạy tiếp theo.
  Tech-debt P2 ghi nhận vấn đề gốc.
