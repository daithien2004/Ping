# ADR-0093: Chưa tách realtime thành service riêng; giảm fan-out trước và đo lại

Status: accepted — dựa trên [báo cáo cô lập gateway](../perf/2026-11-17-gateway-isolation.md) (laptop, một mẫu mỗi cấu hình, môi trường nhiễu). — **được thay bởi [ADR-0098](0098-tach-realtime-service.md): service Realtime đã được tách theo plan học tập.**
Date: 2026-11-17

## Context

Kế hoạch scale (B4) chỉ cho tách realtime nếu số đo cho thấy tải socket và tải REST tranh tài nguyên, hoặc deploy API làm
rớt socket gây hại thật. Hai phép đo có trong tay:

- **Tranh tài nguyên:** trong cùng process, bão reconnect 300 socket làm p95 của REST tăng 2,0× (tải nhẹ) và 3,0× (tải cao)
  so với REST một mình. Khi bật presence theo thành viên đang xem ([ADR-0091](0091-presence-theo-thanh-vien-dang-xem.md))
  mức tăng còn 1,4× và 1,2×.
- **Deploy làm rớt socket:** cuốn chiếu ba bản sao dưới tải làm mọi socket nối lại một lần (join lại p50 ~0,5 giây ở client đo),
  0 lỗi 5xx, 0 tin mất; cursor `after` vá khoảng hở về 100% ([ADR-0092](0092-nhieu-ban-sao-api-sau-nginx.md)).

## Decision

1. **Chưa tách realtime.** Phần lớn nhiễu đến từ fan-out presence mà B3 đã giải quyết bằng một thay đổi nhỏ trong gateway,
   không thêm đơn vị triển khai. Deploy làm nối lại socket là có thật nhưng đã được vá bằng cursor.
2. **Làm trước các bước rẻ hơn tách service**, theo thứ tự: presence theo thành viên (đã là mặc định duy nhất từ ADR-0096),
   rồi thử nghiệm pool: tăng `PG_POOL_MAX` hoặc dùng pool riêng cho gateway (giả thuyết cơ chế, chưa kiểm chứng).
3. **Điều kiện để mở lại B4:** ở môi trường khỏe (REST một mình đạt p95 < 200 ms), lặp lại phép đo trên, sau khi B3 và bước pool
   đã bật; nếu REST p95 khi có storm vẫn > 1,25× REST một mình ở ít nhất hai lần chạy lặp, hoặc số kết nối socket đồng thời một
   instance chạm trần RAM/FD trước trần REST, thì thiết kế hướng A của kế hoạch (Redis emitter, `apps/realtime`) có cơ sở.
   Thiết kế ở kế hoạch vẫn là điểm xuất phát; điểm khó đã biết: `onlineUserIds`/`countUserSockets` dùng `fetchSockets` mà
   emitter không có.

## Alternatives

- **Tách ngay theo kế hoạch:** thêm một service, một pipeline và một phụ thuộc Redis bắt buộc giữa REST và socket, trong khi số đo
  hiện tại chưa chứng minh được phần chênh còn lại sau B3 là thật.
- **Không làm gì thêm:** loại, vì còn chênh 1,2–1,4× chưa giải thích được.

## Consequences

- Bằng chứng yếu: một mẫu mỗi cấu hình, REST một mình đã chậm (p95 1,2 giây ở ~70 req/s) trong Docker VM 3,1 GB; chỉ có giá trị
  tương đối. Quyết định này đảo được khi có phép đo khỏe hơn.
- Cơ chế (tranh pool Postgres) chỉ là giả thuyết.
