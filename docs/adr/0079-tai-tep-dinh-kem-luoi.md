# ADR-0079: Tải tệp đính kèm lười theo vùng nhìn

Status: accepted — trong kế hoạch sửa Ping theo [thực hành Discord](../discord-practices.md) mục 3,
thi công phiên 2026-11-06.
Date: 2026-11-06

## Context

Mỗi tệp đính kèm từng bắn **hai** request khi render: link gốc và link thumbnail, bất kể đã vào
màn hình hay chưa; `refetchInterval: 45_000` còn hỏi lại liên tục khi component còn mount. Thuộc
tính `loading="lazy"` trên `<img>` chỉ hoãn **tải ảnh**, không hoãn hai request lấy link ký. Một
kênh nhiều ảnh vì vậy tạo đợt request lớn ngay khi mở, cộng vào hạn mức chung 100/phút/IP.

## Decision

1. **Viewport là cổng tải**: dùng `IntersectionObserver` (hook `useInView`, chuyển từ
   `features/gifs/` sang `lib/` để dùng chung) gắn vào thẻ tệp đính kèm. Ảnh chỉ xin **thumbnail**
   khi thẻ vào vùng nhìn (rootMargin 100 px).
2. **Link gốc tải theo thao tác**: ảnh chỉ xin link gốc khi mở xem trước hoặc bấm tên tệp; tệp
   không phải ảnh xin link khi vào vùng nhìn vì tên tệp là link tải duy nhất. Bấm tên tệp ảnh
   khi chưa có link sẽ chờ link rồi tự kích hoạt tải xuống.
3. **Nâng TTL link tin nhắn và bỏ `refetchInterval`**: `AttachmentLimits.URL_SECONDS` từ 60 giây
   (ADR-0053) lên 24 giờ — thay đổi quyết định cũ, lý do ở mục "Thay đổi so với ADR-0053" bên
   dưới. Link sống 24 giờ nên hỏi lại mỗi 45 giây không còn ý nghĩa. Cache giữ 15 phút
   (`staleTime`), `gcTime` 20 phút.
4. **Hết hạn thì xin lại một lần**: ảnh lỗi tải (`onError`) gọi `refetch` đúng một lần cho mỗi
   lần mount; `retry: false` giữ nguyên để 403 không tự lặp.

## Thay đổi so với ADR-0053

ADR-0053 đặt URL tải tệp tin nhắn sống 60 giây và client làm mới trước hạn. Sau khi chuyển sang
tải lười, 60 giây buộc phải hỏi lại liên tục hoặc để link chết giữa chừng (ảnh đã render vẫn ổn,
nhưng bấm tải/xem lại sau một phút dùng link cũ và nhận 403). Nâng lên 24 giờ chấp nhận được vì:

- Mỗi lần tải, `/attachments/:id/file` **vẫn đọc lại quyền/membership từ Postgres** cho đúng
  `user` trong URL; mất quyền hoặc tệp bị xóa là 403/404 ngay, không phụ thuộc hạn chữ ký.
- URL ràng buộc user trong HMAC, phục vụ `private, no-store`, mở bằng `no-referrer`, access log
  và Sentry đã bỏ query — cùng mô hình bearer capability đã chấp nhận ở ADR-0053.
- Rủi ro tăng thêm là thời gian một URL bị lộ còn dùng được, không phải quyền hạn mới.

## Consequences

- Kênh nhiều ảnh chỉ tốn request cho ảnh thật sự nhìn thấy, và mỗi ảnh chỉ một request thumbnail
  thay vì hai request ngay lập tức.
- Link sống 24 giờ nên tab mở lâu vẫn tải/xem lại được; quá 15 phút (`staleTime`) lần mở sau xin
  link mới, thumbnail lỗi tải thì refetch đúng một lần.
- Hành vi tải xuống không đổi về bản chất: trình duyệt vẫn điều hướng theo `Content-Disposition`
  của API vì link khác origin.
- Ảnh ngoài màn hình không có thumbnail cho tới khi cuộn tới; chiều cao thẻ do phần tên tệp giữ,
  không gây nhảy layout khi ảnh xuất hiện.
