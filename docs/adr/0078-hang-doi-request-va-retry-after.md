# ADR-0078: Hàng đợi request phía client và tôn trọng Retry-After

Status: accepted — trong kế hoạch sửa Ping theo [thực hành Discord](../discord-practices.md) mục 2,
thi công phiên 2026-11-06.
Date: 2026-11-06

## Context

API dùng một cửa sổ `100 request/phút/IP` **cho mỗi route** với khóa 60 giây khi vượt
(`app.module.ts`; đọc kỹ `@nestjs/throttler` cho thấy khoá đếm ghép Controller-Handler, không phải
một bộ đếm chung — ADR-0080 sau này tách tiếp thành bucket theo nhóm route và khoá theo người
dùng). Guard có trả `Retry-After` cùng `X-RateLimit-Reset` qua `RedisThrottlerStorage`. Nhưng hai
phía còn hở:

- **Client không đọc các header đó.** `api-client` chỉ xử lý 401 và lỗi mạng; gặp 429 là ném
  `ApiError` ngay, còn TanStack Query retry theo lịch riêng. Trình duyệt lại chỉ cho JS đọc header
  khác origin nếu API khai trong `Access-Control-Expose-Headers` — cấu hình cũ chỉ mở `X-Request-Id`.
- **Không giới hạn số request đang bay.** Một trang mount nhiều component cùng lúc; trình duyệt mở
  tối đa ~6 kết nối/host nên phần còn lại xếp ở tầng socket, không ai điều tiết theo hạn mức API.

Kết quả đo được (trước ADR-0077): 69 request unread bắn trong 83 ms, 38 bị 429, các request cần
thiết bị đẩy chậm tới 8 giây. Giảm số request là việc của ADR-0077; ADR này lo phần **điều tiết**
để một đợt bắn bất thường không biến thành khóa cả API.

## Decision

1. **Hàng đợi trong `lib/api-client.ts`**: tối đa **6** request đang bay (bằng số kết nối trình
   duyệt mở cho một host), FIFO. Mọi request — kể cả `/auth/refresh` và upload XHR — đi qua hàng
   đợi. SSE (`stream`) nhả suất ngay khi nhận header vì kết nối dài không được giữ chỗ.
2. **429 tạm dừng TOÀN BỘ hàng đợi** đúng `Retry-After` (không có header → 1 giây; trần 60 giây
   theo `blockDuration` của server) rồi mới nhả suất. Trong lúc tạm dừng, kể cả refresh cũng chờ —
   bắn vào cửa sổ đang khóa chỉ kéo dài khóa. **Cố ý áp cho cả mutation**: gửi tin nhắn trong lúc
   chờ cũng bị giữ, vì bắn sớm chỉ ăn 429 và kéo dài khóa; người dùng thấy nút gửi chờ thay vì lỗi.
3. **Request GET nhận 429 tự chờ rồi thử lại một lần**: sau `Retry-After` (cùng trần 60 giây),
   phát lại đúng một lần; vẫn 429 thì trả lỗi cho UI. POST/PUT/PATCH/DELETE không tự thử lại vì
   không chắc idempotent — việc chờ vẫn do hàng đợi lo cho các request sau.
4. **Đọc `X-RateLimit-Remaining`**: response trả `0` thì tạm dừng tới `X-RateLimit-Reset`, không
   đợi tới khi ăn 429. Đây là yêu cầu phía client trong tài liệu rate limit của Discord.
5. **Hủy đúng lúc**: request còn trong hàng đợi mà `AbortSignal` kích hoạt sẽ bị gỡ khỏi hàng và
   từ chối với `AbortError`, không bao giờ gửi đi.
6. **CORS mở header điều tiết**: `Access-Control-Expose-Headers` thêm `Retry-After`,
   `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Thiếu bước này thì toàn bộ
   logic trên là code chết trong trình duyệt.
7. **TanStack Query không retry 4xx** (gồm 429), chỉ retry lỗi mạng/5xx tối đa 2 lần. Việc chờ
   `Retry-After` và thử lại một lần thuộc `api-client`; retry tầng query chỉ nhân đôi request
   trong lúc chờ.

## Consequences

- Một trang không còn bắn hàng chục request song song; các request xếp hàng và tự giãn theo header.
- Khi bucket thật sự cạn, UI có thể đứng tối đa 60 giây thay vì nhận 429 liên tiếp — đây là
  backpressure đúng, không phải treo: request đã phát vẫn chạy, request mới chờ.
- Hàng đợi là state cấp module-tab, không chia sẻ giữa các tab; mỗi tab vẫn có 6 suất riêng. Hạn
  mức API tính theo IP nên nhiều tab vẫn cộng dồn — giảm số request gốc (ADR-0077) vẫn là biện
  pháp chính.
- Upload lớn chiếm một suất suốt thời gian truyền; chấp nhận vì tải file vốn đã tuần tự và có
  thanh tiến trình riêng.
