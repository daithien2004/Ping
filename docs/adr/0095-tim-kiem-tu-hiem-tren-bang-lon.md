# ADR-0095: Tìm kiếm từ hiếm trên bảng lớn và quyết định không phân vùng `Message`

- Trạng thái: đề xuất
- Ngày: 2026-11-17

## Bối cảnh

Đo ở 10 triệu tin nhắn ([báo cáo](../perf/2026-11-17-big-data.md)): phân trang cursor và đếm chưa đọc ở mức vài ms, nhưng tìm một từ
hiếm bằng truy vấn của `search.service.ts` mất 75–112 giây vì `ORDER BY id DESC LIMIT 21` khiến planner quét ngược `Message_pkey`
và lọc ~10 triệu hàng.

## Quyết định

1. **Không phân vùng `Message` theo `id`.** Phân vùng không làm truy vấn nhanh hơn (planning time còn tăng 8–25 ms) và không tạo được
   khóa duy nhất `(channelId, authorId, nonce)` mà quy tắc 12 cần. Xem lại khi cần xóa dữ liệu cũ hàng loạt.
2. **Không dùng replica đọc lúc này.** Lag cận dưới cỡ mili giây trên một máy, nhưng chưa có tải đọc nào đòi hỏi; thêm replica kéo theo
   vấn đề đọc-sau-ghi và vận hành.
3. **Sửa tìm kiếm khi có dữ liệu thật:** thăm dò đếm tối đa 1000 hàng khớp; dưới ngưỡng thì lấy hàng khớp qua bitmap index trước
   rồi sắp xếp (đã đo 0,3 s thay cho 75–112 s); trên ngưỡng giữ truy vấn gốc. Chưa áp vào code vì chưa đo dạng này với từ phổ biến và
   dữ liệu seed là tổng hợp.

## Hệ quả

- Hôm nay endpoint tìm kiếm có thể treo vài chục giây trên server có hàng chục triệu tin; timeout 503 của Postgres (quy tắc 17) là lớp
  chặn duy nhất. Đây là rủi ro đã biết, ghi lại ở đây.
- Cần một task riêng để sửa `search.service.ts` kèm test và đo lại.
