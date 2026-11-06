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
3. **Bỏ `refetchInterval`**: link ký sống 24 giờ (mục 7 của kế hoạch sẽ nâng TTL), hỏi lại mỗi
   45 giây không đổi kết quả. Cache giữ 15 phút (`staleTime`), `gcTime` 20 phút.
4. **Hết hạn thì xin lại một lần**: ảnh lỗi tải (`onError`) gọi `refetch` đúng một lần cho mỗi
   lần mount; `retry: false` giữ nguyên để 403 không tự lặp.

## Consequences

- Kênh nhiều ảnh chỉ tốn request cho ảnh thật sự nhìn thấy, và mỗi ảnh chỉ một request thumbnail
  thay vì hai request ngay lập tức.
- Link hết hạn sau 24 giờ trên một tab mở lâu vẫn được phục hồi: thumbnail lỗi → refetch; link
  tải/xem trước chỉ được xin khi cần nên luôn mới.
- Hành vi tải xuống không đổi về bản chất: trình duyệt vẫn điều hướng theo `Content-Disposition`
  của API vì link khác origin.
- Ảnh ngoài màn hình không có thumbnail cho tới khi cuộn tới; chiều cao thẻ do phần tên tệp giữ,
  không gây nhảy layout khi ảnh xuất hiện.
