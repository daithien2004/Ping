# ADR-0090: Outbox relay chọn hàng bằng `FOR UPDATE SKIP LOCKED`, không đốt attempts khi Redis chết

Status: accepted — OWNER duyệt kế hoạch chốt v2 (2026-11-13), mục A0.4.
Date: 2026-11-13

## Context

[ADR-0044](0044-gap-recovery.md) và T1.3 dựng outbox: `OutboxEvent` ghi cùng transaction
với dữ liệu nghiệp vụ, `OutboxRelayService` quét bảng và `XADD` vào Redis Stream `stream:outbox`.
Ghi chú cục bộ W3 (2026-10-23, không commit) liệt kê giới hạn của relay. Đối chiếu code ngày 2026-11-13:

- **Đã sửa từ trước** (commit `f3f3d5e`): `publishedAt` không còn được đặt khi Redis chết — relay ném
  lỗi khi `!redis.isUp` và đi vào nhánh retry.
- **Phát trùng:** `EventsModule` nằm trong `AppModule` nên mọi process (API, worker, mỗi instance)
  đều chạy relay. Cờ `running` chỉ chặn trong một process; hai relay cùng `findMany` ra cùng hàng
  và cùng `XADD`. Test e2e mới tái hiện: hai instance, 30 event → 59 entry trong stream.
- **Không bỏ cuộc:** vượt `MAX_ATTEMPTS` chỉ log, vẫn thử mãi.
- **Redis chết đốt attempts:** mỗi tick lúc Redis chết tăng `attempts` cho mọi event. Chỉ sửa điểm
  "bỏ cuộc" mà không sửa điểm này thì một sự cố Redis khoảng 6 phút sẽ đẩy mọi event chờ qua ngưỡng
  và bỏ chúng vĩnh viễn.

## Decision

1. **Chọn batch bằng một transaction** với `SELECT … FOR UPDATE SKIP LOCKED` (điều kiện
   `publishedAt IS NULL AND nextRetryAt <= now() AND attempts < OUTBOX_MAX_ATTEMPTS`, sắp theo
   `createdAt`, `LIMIT 50`). `XADD` và `UPDATE` nằm trong cùng transaction. Hai relay không bao giờ
   giữ cùng một hàng.
2. **Không gắn relay vào role worker.** `pnpm dev` chỉ chạy API; nếu relay chỉ chạy ở worker thì
   môi trường dev không phát event và AI indexer đứng im. `SKIP LOCKED` đúng ở mọi cách triển khai.
3. **Redis chết = không làm gì:** `tick()` chỉ cập nhật gauge rồi thoát; không đọc batch, không đổi
   `attempts`/`nextRetryAt`. `attempts` chỉ tăng khi `XADD` lỗi lúc Redis đang sống.
4. **Bỏ cuộc có quan sát được:** hàng có `attempts >= OUTBOX_MAX_ATTEMPTS` (10) bị loại khỏi truy vấn
   relay; gauge mới `outbox_dead` đếm chúng; lần chạm ngưỡng log `error` một lần. Không thêm cột/
   migration — trạng thái "chết" suy ra từ `attempts`.
5. Interactive transaction đặt `timeout: 15_000` ms vì `XADD` nằm bên trong (Prisma mặc định 5 s).

## Consequences

- Hết phát trùng giữa nhiều process. Vẫn **at-least-once**: process chết giữa `XADD` và commit thì
  hàng chưa đánh dấu và được phát lại; consumer phải idempotent (AI indexer đã vậy).
- Giữ khóa hàng và một kết nối DB trong lúc gọi Redis. Batch 50 + `commandTimeout` của Redis giới hạn
  thời gian giữ; chấp nhận được ở quy mô hiện tại. Nếu cần throughput cao hơn: tách "claim" và
  "publish" thành hai bước có lease.
- Event chết không tự hồi phục: cần người xem `outbox_dead` và `UPDATE "OutboxEvent" SET attempts = 0,
"nextRetryAt" = now() WHERE …` sau khi sửa nguyên nhân. Chưa có alert cho gauge này.
- Phạm vi outbox hiện tại: consumer duy nhất của `stream:outbox` là AI indexer. Realtime tới client
  **không** đi qua outbox (REST ghi DB rồi gateway phát trực tiếp); mất gói realtime do client tự vá
  bằng cursor (ADR-0044).
