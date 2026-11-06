# ADR-0082: CSDL riêng cho e2e web ở máy dev

Status: accepted — việc 5 của [Triển khai emoji đã xóa](../emoji-da-xoa-trien-khai.md).
Date: 2026-11-06

## Context

E2E web (`apps/web/e2e/`) chạy với `reuseExistingServer: true`: đang có `pnpm dev` thì Playwright
dùng lại API đó, và API dev trỏ CSDL `ping`. 18 spec đăng nhập tài khoản seed (`alice@ping.dev`…) và
ghi vào server seed `Ping Playground`, nên mỗi lần chạy để lại tin, reaction, emoji trong CSDL dev.
Ngày 2026-11-06 đã phải dọn tay 83 tin và 54 reaction `test_emoji`; chính dữ liệu đó làm lộ hai lỗi
của ADR-0081 trên giao diện dev. CI không bị: job `web-e2e` có Postgres riêng, migrate và seed sẵn.

## Decision

1. Ở máy dev (không có biến `CI`), `playwright.config.ts` đặt `DATABASE_URL` thành CSDL
   `ping_e2e`. API, `globalSetup` và các script spec gọi (`seed-messages`, `verify-user`) đều thừa
   hưởng biến này; dotenv và `ConfigModule` không ghi đè biến đã có.
2. Trước khi bật API, `scripts/prepare-e2e-db.mjs` tạo `ping_e2e` nếu chưa có, chạy
   `prisma migrate deploy` và `prisma db seed` (idempotent; lần đầu ~20 giây, các lần sau ~4 giây).
   Script từ chối chạy khi tên CSDL là `ping`.
3. Ở máy dev, Playwright luôn tự bật API và web (`reuseExistingServer` chỉ bật trên CI). Phải tắt
   `pnpm dev` trước khi chạy e2e; nếu cổng 3000/4000 còn bận, Playwright báo lỗi ngay thay vì âm
   thầm ghi vào CSDL dev.
4. CI giữ nguyên.

## Alternatives

- **Dùng chung CSDL dev, dọn tay khi bẩn**: rẻ nhưng rác quay lại sau mỗi lần chạy và che lỗi thật
  (ADR-0081).
- **E2E ở cổng khác (ví dụ API 4100, web 3100) để chạy song song với `pnpm dev`**: giữ được vòng lặp
  cũ nhưng phải bỏ `localhost:4000` viết cứng trong hơn 18 file spec và `global-setup.ts`. Để dành
  khi việc tắt `pnpm dev` thành phiền thật.
- **Spec tự dọn dữ liệu sau khi chạy**: phải làm ở từng spec và hỏng khi spec dừng giữa chừng.

## Consequences

- CSDL dev không còn nhận dữ liệu từ e2e web. `ping_e2e` vẫn tích dữ liệu qua các lần chạy như CSDL
  dev trước đây; muốn sạch thì `DROP DATABASE ping_e2e`, lần chạy sau tự tạo lại.
- Không chạy được e2e cùng lúc với `pnpm dev`; mỗi lần chạy tốn thêm thời gian khởi động/compile.
- Redis vẫn dùng chung DB 0 với dev. Không xung đột khi `pnpm dev` đã tắt.
- E2E API (`apps/api/test`) không đổi: dùng Nest app trong tiến trình test với `.env` gốc như trước.
