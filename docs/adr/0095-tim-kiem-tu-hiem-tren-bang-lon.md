# ADR-0095: Tìm kiếm từ hiếm trên bảng lớn và quyết định không phân vùng `Message`

- Trạng thái: chấp nhận
- Ngày: 2026-11-17

## Bối cảnh

Đo ở 10 triệu tin nhắn ([báo cáo](../perf/2026-11-17-big-data.md)): phân trang cursor và đếm chưa đọc ở mức vài ms, nhưng tìm một từ
hiếm bằng truy vấn của `search.service.ts` mất 75–112 giây vì `ORDER BY id DESC LIMIT 21` khiến planner quét ngược `Message_pkey`
và lọc ~10 triệu hàng.

## Quyết định

1. **Không phân vùng `Message` theo `id`.** Phân vùng không làm truy vấn nhanh hơn (planning time còn tăng 8–25 ms) và không tạo được
   khóa duy nhất `(channelId, authorId, nonce)` mà quy tắc 12 cần. Xem lại khi cần xóa dữ liệu cũ hàng loạt.
2. **Không dùng replica đọc lúc này** (về sau thay bởi [ADR-0102](0102-replica-doc-co-dinh-tuyen.md)). Lag cận dưới cỡ mili giây trên một máy, nhưng chưa có tải đọc nào đòi hỏi; thêm replica kéo theo
   vấn đề đọc-sau-ghi và vận hành.
3. **Sửa tìm kiếm (đã áp vào `search.service.ts`):** thăm dò đếm tối đa 1000 hàng khớp (toàn bảng, 30–170 ms ở 10 triệu tin). Dưới
   ngưỡng thì lấy hàng khớp qua bitmap index vào CTE `MATERIALIZED` (kèm các cột cần dùng, **không** join lại `Message`) rồi mới sắp xếp:
   48 ms thay cho 75–112 s. Từ ngưỡng trở lên giữ truy vấn gốc. Bài học khi đo: bản CTE chỉ lấy `id` rồi join lại `Message` vẫn mất
   50 s vì planner join bằng cách quét pkey; phải mang cột theo CTE ([dữ liệu](../perf/data/2026-11-17-b5/)).

## Hệ quả

- Mỗi lần tìm kiếm thêm một truy vấn thăm dò (rẻ khi từ phổ biến vì dừng sau 1000 hàng khớp).
- Chưa đo trường hợp giữa (vài nghìn hàng khớp) và trên dữ liệu tiếng thật; trần 1000 là điểm khởi đầu.
- Test: `search.service.spec.ts` kiểm hai nhánh; e2e tìm kiếm và IDOR xanh.
