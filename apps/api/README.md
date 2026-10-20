# apps/api

NestJS 12 (ESM: `module` nodenext, import tương đối phải có đuôi `.js`), PostgreSQL + Prisma 7 (driver adapter `pg`),
Redis, Socket.IO với Redis adapter. Backend **không giữ state** trong RAM: nhiều instance chạy song song.

Chạy cả dự án: xem [README gốc](../../README.md). Dưới đây chỉ là những thứ riêng của API.

## Module (`src/modules/`)

| Module     | Việc                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| `auth`     | đăng ký, đăng nhập, refresh xoay vòng, đăng xuất; `JwtAuthGuard`, `CsrfGuard`               |
| `users`    | hồ sơ người dùng                                                                            |
| `servers`  | server, tham gia bằng mã mời, rời, danh sách thành viên (kèm `online`), kick, quyền của tôi |
| `channels` | channel của server                                                                          |
| `roles`    | role, gán role, bitmask quyền                                                               |
| `messages` | gửi/sửa/xóa tin, lịch sử phân trang cursor, idempotency bằng `nonce`                        |
| `realtime` | gateway Socket.IO: xác thực lúc handshake, room, presence, typing                           |
| `ability`  | `AbilityFactory` + `AbilityGuard` (CASL), quy tắc nằm ở `@ping/shared`                      |
| `audit`    | ghi AuditLog cho hành động nhạy cảm                                                         |
| `health`   | `/health` (liveness), `/ready` (readiness: Postgres, Redis, đang tắt)                       |

Hạ tầng dùng chung ở `src/infra/` (Prisma, Redis + chính sách khi Redis chết, metrics, Sentry, vòng đời tắt êm,
throttler, adapter Socket.IO) và `src/common/` (filter lỗi, guard, interceptor, pipe).

## Lệnh

```bash
pnpm --filter api start:dev       # chạy dev, tự build lại khi sửa (pnpm dev ở gốc chạy cả web)
pnpm --filter api test            # test đơn vị (Vitest)
pnpm --filter api test:e2e        # e2e: Postgres + Redis thật (docker compose up -d), tự nạp .env gốc
pnpm --filter api drill:redis     # diễn tập tắt Redis thật (cũng drill:postgres), cần API đã build
pnpm --filter api exec prisma migrate dev --name <ten>   # tạo migration mới, đọc docs/runbook/migrations.md
pnpm --filter api exec prisma db seed                    # dữ liệu demo (idempotent)
```

Spec e2e dùng Redis DB số 1 (`E2E_REDIS_URL` để đổi) nên `flushdb()` không xóa dữ liệu dev ở DB 0.

## Biến môi trường

Kiểm tra một lần lúc khởi động bằng zod (`src/config/env.schema.ts`); thiếu hoặc sai thì tiến trình dừng ngay.
Mẫu: [`.env.example`](../../.env.example) ở gốc repo (API đọc `../../.env`).

| Biến                       | Mặc định    | Ý nghĩa                                                                                        |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | development | `production` ẩn thông điệp lỗi nội bộ và tắt Swagger                                           |
| `PORT`                     | 4000        | cổng HTTP (và Socket.IO)                                                                       |
| `DATABASE_URL`             | bắt buộc    | chuỗi kết nối Postgres                                                                         |
| `REDIS_URL`                | bắt buộc    | chuỗi kết nối Redis                                                                            |
| `JWT_ACCESS_SECRET`        | bắt buộc    | khóa ký access token, ≥ 32 ký tự (production: chuỗi ngẫu nhiên dài, lấy từ secret manager)     |
| `WEB_ORIGIN`               | bắt buộc    | origin của web cho CORS và socket                                                              |
| `TRUST_PROXY`              | 0           | số proxy đứng trước API (sau một load balancer đặt 1: rate limit theo IP phụ thuộc vào đây)    |
| `PG_QUERY_TIMEOUT_MS`      | 10000       | timeout mỗi truy vấn Postgres (ADR-0026)                                                       |
| `REDIS_COMMAND_TIMEOUT_MS` | 1000        | timeout mỗi lệnh Redis                                                                         |
| `SHUTDOWN_GRACE_MS`        | 0           | khi nhận SIGTERM: `/ready` trả 503 nhưng vẫn nhận request, cho load balancer kịp loại instance |
| `SHUTDOWN_TIMEOUT_MS`      | 25000       | trần cho cả quá trình tắt êm                                                                   |
| `METRICS_PORT`             | (trống)     | cổng riêng cho `GET /metrics`; trống thì không mở. Chỉ cho mạng nội bộ (ADR-0031)              |
| `SENTRY_DSN`               | (trống)     | trống thì tắt hẳn Sentry                                                                       |

## Quy tắc cần nhớ khi sửa API

Đầy đủ ở [CLAUDE.md](../../CLAUDE.md). Những cái hay bị quên: controller mỏng, logic ở service; endpoint mới phải có
zod + guard xác thực + kiểm quyền CASL + test IDOR; lỗi dùng mã trong `ErrorCodes`; mọi chỗ gọi Redis trên đường
request phải có chính sách khi Redis chết; migration theo expand/contract.
