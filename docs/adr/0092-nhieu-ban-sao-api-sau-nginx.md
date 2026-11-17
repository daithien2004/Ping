# ADR-0092: Chạy nhiều bản sao API sau Nginx: cách scale, ngân sách pool, tắt êm và vá khoảng hở

Status: accepted — bằng chứng ở [báo cáo scale-out](../perf/2026-11-17-scale-out.md) (laptop, một mẫu mỗi kịch bản).
Date: 2026-11-17

## Context

Backend stateless (quy tắc 1) và Socket.IO đã dùng Redis adapter, nên thêm bản sao API là cách scale đầu tiên. Cần
biết: cấu hình mẫu có scale được không, nguyên nhân hỏng nào có thể gặp, và khi nào mới cần tách gateway (ADR-0093).

## Decision

1. **Scale bằng số bản sao, không đổi code.** `docker compose up --scale api=N` hoạt động vì `api` không publish cổng và
   Nginx dùng `server api:4000 resolve;` (nhận mọi bản ghi A của Docker DNS, làm mới theo `valid=10s`). Không cần sticky
   session vì client chỉ dùng `transports: ['websocket']`: 40/40 listener qua round-robin join được.
2. **Ngân sách kết nối:** `số bản sao × PG_POOL_MAX + worker × PG_POOL_MAX + dự phòng ≤ max_connections` của Postgres.
   Đo được pool đầy ở tải nhẹ (40 tin/giây): 3 × 10 = 30 kết nối, tức là phải tính theo pool tối đa chứ không theo mức
   dùng trung bình. Với `max_connections=100` và pool 10, tối đa 6 bản sao cộng một worker.
3. **Tắt êm giữ nguyên:** `SHUTDOWN_GRACE_MS=10000`, `SHUTDOWN_TIMEOUT_MS=25000`, `stop_grace_period: 40s`. Đo được
   mỗi bản sao dừng trong 17,8–19,1 giây khi có tải, nên không bị SIGKILL giữa chừng.
4. **Vá khoảng hở là bắt buộc, không phải tối ưu:** mỗi lần bản sao restart, mọi socket của nó mất tin trong lúc nối lại
   (~0,7% tin trung vị ở tải đo). Cursor `after` (ADR-0044) vá về 100%; không thay thế được bằng gì khác.
5. **Không thêm health check chủ động vào Nginx** vì Nginx mã nguồn mở không có; thất bại kết nối bị Nginx thử lại sang bản
   sao khác (đã quan sát với `POST`) và `max_fails` loại bản sao đã chết.

## Alternatives

- **Sticky session / ip_hash:** không cần vì chỉ WebSocket; thêm ràng buộc cho cân bằng tải.
- **Nginx Plus / Traefik / HAProxy với health check chủ động:** loại bớt cửa sổ từ lúc bản sao chết tới lúc bị loại;
  chưa cần ở quy mô này, đổi khi có số đo cho thấy lỗi 5xx do cửa sổ đó.
- **Hạ `PG_POOL_MAX`** để dành chỗ cho nhiều bản sao: đổi sau khi đo độ trễ truy vấn theo pool; chưa làm.

## Consequences

- Cuốn chiếu ba bản sao dưới tải mất ~55 giây; 0 tin mất hoặc trùng, 0 lỗi 5xx ở tải đo (xem giới hạn: ~16,5 tin/giây).
- Chưa kiểm chứng ở tải cao, nhiều channel, nhiều IP khách (`TRUST_PROXY`), hay khi gộp presence giữa các bản sao.
- File đính kèm vẫn nằm ở volume cục bộ: scale ra nhiều máy cần lưu trữ dùng chung (chưa làm).
