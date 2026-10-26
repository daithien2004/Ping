# Failure modes: hệ thống làm gì khi hạ tầng hỏng

Mọi dòng trong bảng đã được **diễn tập thật** (tắt container) hoặc có test tự động. Quyết định và lý
do: [ADR-0026](../adr/0026-failure-modes-and-graceful-shutdown.md).

## Bảng hành vi

| Sự cố                                  | Hành vi                                                                                                                                                                                                          | `/ready`                                            | Bằng chứng                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| **Redis chết**                         | Đọc/ghi dữ liệu, gửi/sửa/xóa tin **vẫn chạy** (Postgres là nguồn sự thật). Đăng nhập/đăng ký/refresh và request có `Idempotency-Key` → **503**                                                                   | **200** `degraded`, `details.redis.status = "down"` | `pnpm --filter api drill:redis`, `test/redis-outage.e2e-spec.ts`        |
| **Postgres chết**                      | Mọi request cần DB → **503** `SERVICE_UNAVAILABLE` kèm `requestId`, trả lời trong vài ms, không crash. Tự phục hồi khi DB về, không cần restart                                                                  | **503**                                             | `pnpm --filter api drill:postgres`, `src/common/db-unavailable.spec.ts` |
| **Postgres/Redis chậm hoặc treo**      | Mọi lời gọi có timeout: Postgres `PG_QUERY_TIMEOUT_MS` (mặc định 10s) + chờ kết nối 5s; Redis `REDIS_COMMAND_TIMEOUT_MS` (1s). Quá hạn → như "chết" ở trên                                                       | như trên                                            | `test/timeouts.e2e-spec.ts`                                             |
| **Nhận SIGTERM (deploy, scale xuống)** | `/ready` → 503; chờ `SHUTDOWN_GRACE_MS` để LB loại instance (vẫn nhận request); đóng Socket.IO rồi HTTP, **chờ request đang chạy xong**; sau đó mới đóng Redis/Postgres; quá `SHUTDOWN_TIMEOUT_MS` thì `exit(1)` | **503**                                             | `test/shutdown-drain.e2e-spec.ts`, `test/shutdown-order.e2e-spec.ts`    |
| **Một instance API chết**              | LB loại khỏi pool (dựa `/ready`); client Socket.IO tự kết nối lại vào instance khác và tải lại tin bị lỡ (F5)                                                                                                    | —                                                   | `apps/web/e2e/realtime.spec.ts` (mất mạng, bù tin)                      |

`/health` (liveness) **không bao giờ** kiểm tra DB/Redis: DB chập chờn mà liveness đụng DB thì
orchestrator restart process khỏe mãi mà không sửa được gì.

## Chính sách từng thành phần khi Redis chết

| Thành phần                                                           | Chính sách      | Hậu quả khi Redis chết                                                                            |
| -------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Rate limit chung                                                     | fail-open       | không giới hạn tần suất (log `warn`, tối đa 1 lần/10 giây)                                        |
| Rate limit `login`, `register`, `refresh` (`@RateLimitFailClosed()`) | **fail-closed** | 503: không để lộ cửa dò mật khẩu không giới hạn                                                   |
| Cache ability                                                        | fail-open       | đọc/ghi cache lỗi → tính lại từ Postgres (chậm hơn một chút)                                      |
| Xóa cache ability khi đổi role                                       | fail-open       | quyền cũ có thể còn tối đa **30 giây** (TTL), đổi role vẫn thành công                             |
| `Idempotency-Key` (tạo server/channel/role)                          | **fail-closed** | 503: Redis là nơi duy nhất chống tạo trùng. Tin nhắn dùng `nonce` trong DB nên không bị ảnh hưởng |
| Lưu response idempotent sau khi đã tạo xong                          | fail-open       | thao tác đã thành công không bao giờ bị biến thành lỗi; retry cùng key trong 24h nhận 409         |
| Phát event realtime (`publish` của Socket.IO adapter)                | fail-open       | event không tới client ở instance khác; client bù khi kết nối lại                                 |
| Đếm socket cho presence                                              | fail-open       | chỉ đếm socket trên instance này (không chờ 5 giây hỏi instance khác)                             |

Thêm chỗ gọi Redis trên đường request thì **bắt buộc chọn một chính sách** (CLAUDE.md, quy tắc 17):
dùng `failOpen()` hoặc ném `redisUnavailable()` trong `infra/redis/redis-policy.ts`.

Reaction (TG.2): rate limit riêng 30 thao tác/10 giây/user/channel cũng **fail-open** qua
`ReactionRateLimiter`. Redis chết vẫn thả/gỡ được; unique và trần 20 loại/tin nằm trong Postgres
nên không mất bảo vệ khi rate limiter suy giảm. Kiểm bằng `redis-outage.e2e-spec.ts`.

## Cách điều tra

- Log của Redis chết: tìm `"dependency":"redis"` (kèm `policy`: `rate-limit`, `ability-cache`,
  `socket-publish`, `idempotency`…). Mỗi `policy` chỉ ghi tối đa 1 lần/10 giây.
- Log của Postgres chết: `"dependency":"postgres"` + `cause` (tên lỗi, không có host/port). Response
  luôn có `requestId` để tra ngược.
- `GET /api/v1/ready`: `status` là `ok` | `degraded`; 503 là Postgres chết hoặc đang tắt.

## Diễn tập

```bash
docker compose up -d
pnpm --filter api build
pnpm --filter api drill:redis      # dừng container redis vài giây
pnpm --filter api drill:postgres   # dừng container postgres vài giây
```

Mỗi drill tự chạy API đã build ở cổng 4100 (Redis DB 2), in từng bước PASS/FAIL, và luôn bật lại
container khi kết thúc. Chúng làm dev server/e2e đang chạy lỗi tạm thời nên **không** nằm trong
`test:e2e`.

**Chưa diễn tập thật:** SIGTERM do orchestrator gửi và "deploy giữa lúc có tải" (Windows không gửi
được SIGTERM tới process con; đường chạy của Nest được kiểm bằng `app.close('SIGTERM')`). Làm trên
Linux/staging ở bước CI/CD và nghiệm thu (hướng dẫn 16.4, 16.10).

## Cấu hình

| Biến                       | Mặc định | Ý nghĩa                                                                                                            |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `PG_QUERY_TIMEOUT_MS`      | 10000    | statement_timeout + query_timeout của Postgres                                                                     |
| `REDIS_COMMAND_TIMEOUT_MS` | 1000     | timeout mỗi lệnh Redis                                                                                             |
| `SHUTDOWN_GRACE_MS`        | 0        | thời gian `/ready` đã 503 nhưng vẫn nhận request. **Production: ≥ 2 lần chu kỳ health check của LB** (ví dụ 10000) |
| `SHUTDOWN_TIMEOUT_MS`      | 25000    | trần cho cả quá trình tắt; đặt **nhỏ hơn** `terminationGracePeriod`/`stop_grace_period` của orchestrator           |

Pool Postgres: `connectionTimeoutMillis` cố định 5 giây (chờ lấy kết nối).
