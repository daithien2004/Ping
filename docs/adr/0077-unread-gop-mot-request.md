# ADR-0077: Unread gộp một request cho toàn bộ server

Status: accepted — trong kế hoạch sửa Ping theo [thực hành Discord](../discord-practices.md) mục 1,
thi công phiên 2026-11-06.
Date: 2026-11-06

## Context

Đo trên tài khoản 69 server (Chrome dev, `localhost:3000`, 2026-11-06): một lần F5 bắn **69 request**
`GET /servers/:id/unread` trong 83 ms, **38 request trả 429**; tổng 92 request API cho một trang.

Nguyên nhân nằm ở mô hình cache: `ServerRailItem` gọi `useUnread(serverId)` bên trong `servers.map`,
mỗi server một query key và một lời gọi. Hạn mức chung là `100 req/min/IP` với `blockDuration`
60 giây, nên chỉ riêng unread đã chiếm gần trọn cửa sổ; các request khác của trang (permissions,
members, messages) về sau bị chặn theo.

Vấn đề không phải "hạn mức quá thấp" mà là **N+1 phía client**: số request tỉ lệ với số server của
người dùng, trong khi dữ liệu cần cho rail chỉ là một bảng nhỏ (mỗi channel một dòng).

## Decision

1. **Một endpoint gộp**: `GET /users/me/unread` trả `ServerUnreadDto[]` — mỗi phần tử
   `{ serverId, channels: ChannelUnreadDto[] }`. Người gọi lấy từ JWT, không có id trên path nên
   không cần AbilityGuard/IDOR. Server không có channel vẫn có mặt với `channels: []` (LEFT JOIN)
   để client biết mình còn thuộc server đó.
2. **Giữ endpoint per-server** `GET /servers/:id/unread` cho hợp đồng cũ (client khác, e2e hiện có);
   web không còn gọi. Hai endpoint dùng chung một mảnh SQL đếm (`unreadCounts`) để ngữ nghĩa
   unread/mention không lệch nhau.
3. **Một query key canonical phía web**: `qk.unreadAll = ['unread', 'all']`.
   `useUnread(serverId)` cùng trỏ key này và `select` phần của server mình — N component, **một**
   request. Không chọn phương án "fetch gộp rồi seed từng key per-server" vì trên lần tải đầu các
   component rail mount trước khi request gộp xong và sẽ tự bắn N request đúng như cũ.
4. **Sự kiện realtime vá thẳng cache gộp**: `applyIncomingAll` / `applyReadAll` tìm server chứa
   channel rồi chỉ thay server đó (mảng giữ nguyên tham chiếu nếu không tìm thấy). Reconnect
   invalidate **một** key thay vì N key per-server.
5. **Badge tiêu đề/favicon đọc cache gộp**: `useNotifyBadge(appName)` không cần danh sách id server.
6. **Các điểm invalidate bổ sung** cho thay đổi thành viên/quyền/kênh (tạo–xóa kênh, join/leave/kick,
   tạo–xóa server, gán–xóa role) vì trước đây chúng dựa vào tiền tố `qk.server(id)` để làm mới
   unread per-server, còn key gộp không nằm dưới tiền tố đó.

## Consequences

- Rail 69 server còn **một** request unread; hết chuỗi 429 do unread gây ra. Hạn mức chung và hàng
  đợi phía client vẫn là việc riêng (mục 2 của kế hoạch).
- Payload gộp lớn hơn một response per-server nhưng bị chặn bởi tổng số channel người dùng tham
  gia; thực tế nhỏ hơn nhiều so với 69 round-trip.
- Vá cache theo sự kiện tốn một lần quét server (O(số server)) — không đáng kể so với việc bỏ N
  request.
- Hai endpoint cùng tồn tại: khi sửa ngữ nghĩa đếm phải sửa mảnh SQL dùng chung, không chỉ một
  trong hai.
