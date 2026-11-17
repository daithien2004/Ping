# ADR-0091: Presence chỉ tới socket đã đăng ký thành viên đang xem

Status: accepted — số đo B3 ủng hộ (laptop, một mẫu mỗi cấu hình, xem [báo cáo](../perf/2026-11-16-presence-scope.md)); **cờ `PRESENCE_SCOPED` đã bị gỡ ở [ADR-0096](0096-bo-cho-cu-presence-va-redis-stream.md): presence theo thành viên là cách duy nhất.**
Date: 2026-11-16

## Context

[ADR-0039](0039-presence-batching.md) gộp presence theo cửa sổ thời gian nhưng vẫn phát tới
room `server:<id>` của **mọi** server mà user tham gia. Mỗi lần một socket nối/ngắt, mọi
socket trong server đó nhận một event, nên tổng event theo cặp (user, server) tăng
O(N²) khi N thành viên cùng nối lại (bão reconnect). Mỗi lần phát còn chạy một
`member.findMany` để biết user thuộc server nào, đúng lúc pool Postgres cạn.

Client chỉ hiển thị presence trong panel thành viên của **một** server, và panel chỉ có vài chục
đến vài trăm dòng đã tải. Phần lớn event tới socket không dùng được.

## Decision

1. Hai event client→server mới (hợp đồng ở `packages/shared`):
   - `presence.watch` `{ serverId, userIds[≤100] }` có ack `{ ok: true, online: userId[] }` hoặc
     `{ ok: false, code }`. Ack mang ảnh chụp "ai đang online" lúc đăng ký để bù event đã lỡ.
   - `presence.unwatch` `{ userIds[≤100] }`.
2. Mỗi user được theo dõi là một room `presence:<userId>`. Một socket tối đa 200 room
   (`PRESENCE_WATCH_PER_SOCKET_MAX`), chống rò bộ nhớ; quá thì `TOO_MANY_REQUESTS`.
3. **Kiểm quyền lúc đăng ký:** người gọi phải là member của `serverId`. Id không phải member của
   server đó bị bỏ qua, không báo lỗi riêng, nên không dò được ai là thành viên. Một query
   `member.findMany` cho cả lô.
4. Cờ `PRESENCE_SCOPED` (mặc định `false`):
   - `true`: presence phát vào `presence:<userId>`, **một event cho mỗi user** (không còn theo
     từng server) và **bỏ `member.findMany`** ở mỗi lần nối/ngắt. Vẫn gộp theo `PRESENCE_BATCH_MS`.
   - `false`: đường cũ (room `server:<id>`); `presence.watch` trả `{ ok: true, online: [] }` mà không
     làm gì, nên client mới chạy được với API chưa bật cờ.
5. Tên event `presence.updated` và payload `{ userId, status }` giữ nguyên.
6. **Thu hồi:** khi một member bị kick/ban/rời server hoặc server bị xóa,
   `RealtimeService.refreshAccess`/`notifyServerDeleted` cho socket của họ rời các room
   `presence:<id>` của thành viên server đó (cùng chỗ đang rời room channel/server).
7. Client: `usePresenceWatch` (panel thành viên) đăng ký các thành viên đang hiển thị, tối đa 200,
   gửi lại toàn bộ sau mỗi lần `connect` (room mất khi socket mới nối), và hủy đăng ký khi panel
   ẩn hoặc gỡ.

## Alternatives

- **Event `PresenceBatch`** gộp nhiều user: giảm overhead nhưng đổi hợp đồng và cần
  migration client. Có thể làm sau, độc lập với quyết định này.
- **Kiểm quyền bằng gọi API nội bộ:** thêm một bước mạng cho mỗi lần đăng ký; pool Postgres của
  gateway đã đủ cho một query theo lô. Sẽ xét lại ở B4 nếu tách service realtime.
- **Room `presence:<serverId>:<userId>`** để thu hồi gọn hơn: người phát phải biết các server của
  user, tức giữ lại query mỗi lần nối. Bị loại vì mục tiêu là bỏ query đó.

## Consequences

- Số event presence mỗi socket nhận tỉ lệ với số thành viên đang hiển thị (≤ 200), không phải kích
  thước server. Đo ngày 2026-11-16 (300 socket, một server 500 thành viên, mỗi socket đăng ký 50 người,
  một instance, k6 cùng máy, một mẫu): `presence_received` **377.073 → 32.071 (−91,5%)** so với cờ tắt cùng
  `PRESENCE_BATCH_MS=1000`; so với trước batching 486.644 → 32.071 (−93,4%). Số lệnh phát
  (`presence_emitted_total`) gần như không đổi (1.494 so với 1.496) vì mỗi user chỉ ở một server.
  Cả ba lần đo đều có 40–53 lần nối thất bại và vượt ngưỡng k6 của kịch bản, nên chưa kết luận về độ
  trễ hồi phục; chưa lặp lại; chưa đo nhiều instance hay user ở nhiều server.
- **Thứ tự triển khai bắt buộc:** deploy web có `usePresenceWatch` trước, bật `PRESENCE_SCOPED=true` sau.
  Bật cờ khi client cũ còn chạy thì client cũ không gửi `presence.watch` và mất presence.
  Khi cần quay lại, chỉ cần tắt cờ.
- Phần còn lại chấp nhận được: thành viên rời server thì socket đang theo dõi người đó vẫn nhận
  presence cho tới khi client hủy (panel tải lại danh sách) hoặc socket nối lại (JWT hết hạn sẽ ép nối
  lại). Với client đúng giao thức, đây chỉ là presence online/offline của người từng cùng server.
- Cắt quyền ở mục 6 tốn O(số member) lúc kick/ban (hiếm); server rất đông thì cân nhắc lưu
  `serverId` trong tên room.
- Panel có hơn 200 thành viên đã tải thì phần vượt không được cập nhật theo thời gian thực
  (vẫn có ảnh chụp từ danh sách); cần ảo hóa danh sách nếu server lớn thật.
- Gộp presence vẫn độc lập theo từng instance API; chưa giải quyết khi chạy nhiều instance (B2).
- Đăng ký lỗi (timeout) không tự thử lại cho tới lần `set` hoặc `connect` kế tiếp.
