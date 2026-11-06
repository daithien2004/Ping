# ADR-0080: Rate limit theo bucket, khoá theo người dùng đã xác thực

Status: accepted — việc 4 trong lộ trình [thực hành Discord](../discord-practices.md), thi công
phiên 2026-11-06.
Date: 2026-11-06

## Context

Từ ADR-0027, API có một cửa sổ duy nhất `100 request/phút` với `blockDuration: 60_000`. Điều đó
đúng về con số nhưng sai về phạm vi: `@nestjs/throttler` ghép khoá đếm với
`Controller-Handler`, nên thực tế **mỗi route một bộ đếm 100/phút/IP**, không phải một bộ đếm
chung cho cả API như tài liệu cũ mô tả. Ba vấn đề còn lại:

1. **Cùng một hạn mức cho mọi loại request.** Một trang tải danh sách server (đọc rẻ, hàng chục
   request) và một lần upload (đắt, ghi) ăn chung 100/phút. Đợt đọc nhẹ của người dùng bình
   thường có thể chạm trần chỉ vì số request, không vì tải thật.
2. **Khoá 60 giây là quá dài.** Với cửa sổ cố định 60 giây, một burst ngắn biến thành cả phút
   ngưng trệ cho đúng route đó; web phải chờ hết `Retry-After` mới gửi tiếp (ADR-0078).
3. **Khoá theo IP.** Hai người dùng chung IP (văn phòng, NAT, mạng di động) giành hạn mức của
   nhau, còn kẻ tấn công chỉ cần đổi IP là có hạn mức mới. Sau khi xác thực, danh tính đúng để
   đếm là người dùng.

Ràng buộc: web đang đọc `X-RateLimit-Limit/Remaining/Reset` và `Retry-After` **không hậu tố**
(ADR-0078). Header có hậu tố `-<tên-throttler>` chỉ xuất hiện khi dùng nhiều throttler có tên, nên
mọi bucket phải nằm trên throttler tên `default`.

## Decision

1. **Bucket theo nhóm route**, khai bằng `@Throttle({ default: RATE_LIMIT_BUCKETS.<nhóm> })` với
   hằng số tập trung ở `apps/api/src/common/rate-limit-buckets.ts`:

   | Nhóm             | Hạn mức    | Khoá khi vượt | Route                                                                                                                                                                                               |
   | ---------------- | ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `readLight`      | 240 / 60 s | 3 s           | GET `/users/me*`, `/servers`, `/servers/:id`, `/servers/:id/channels`, `/members`, `/me/permissions`, `/unread`, roles/emoji/sticker/bans/audit-log, `/dms`, `/users/me/blocks`, notification-prefs |
   | `history`        | 120 / 60 s | 2 s           | GET `/channels/:id/messages`, `/channels/:id/pins`, `/messages/:id/reactions/:emoji`; PUT `/channels/:id/read`                                                                                      |
   | `search`         | 40 / 60 s  | 10 s          | GET `/servers/:id/search`                                                                                                                                                                           |
   | `writeMessage`   | 60 / 10 s  | 3 s           | POST `/channels/:id/messages`; PATCH/DELETE `/messages/:id`; pin/unpin; thả/gỡ cảm xúc                                                                                                              |
   | `writeStructure` | 20 / 60 s  | 10 s          | Tạo/sửa/xóa server, kênh, category, role, lời mời, ban, kick, leave, biệt danh; đổi mật khẩu, cài đặt riêng tư, thu hồi phiên                                                                       |
   | `uploads`        | 30 / 60 s  | 5 s           | POST `/uploads`, PUT `/uploads/:id/content`, complete/cancel, GET `/uploads/:id`                                                                                                                    |
   | `attachmentRead` | 600 / 60 s | 2 s           | GET `/attachments/:id/file`, `/attachments/:id/download` — **luôn khoá theo IP**                                                                                                                    |
   | `authCredential` | 10 / 60 s  | 60 s          | POST `/auth/login` — **IP**                                                                                                                                                                         |
   | `authRegister`   | 5 / 60 s   | 60 s          | POST `/auth/register` — **IP**                                                                                                                                                                      |
   | `authSession`    | 30 / 60 s  | 5 s           | POST `/auth/refresh`, POST `/auth/logout` — **IP**                                                                                                                                                  |

   Controller có handler cùng nhóm thì khai ở class (`Roles`, `Categories`, `Bans`, `Emojis`,
   `Stickers`, `Audit`, `Attachments`); controller trộn nhóm (`Users`, `Servers`, `Channels`,
   `Messages`, `Dms`, `Notifications`, `Auth`) khai từng handler để không nới rộng nhóm còn lại.
   Route chưa khai (GIF, `/ask`, tạo DM, prefs thông báo, `GET /`) dùng lưới hứng toàn cục.

2. **Lưới hứng toàn cục hạ xuống `100 / 60 s`, khoá 5 giây** (`app.module.ts`) cho route chưa
   khai bucket. `/health` và `/ready` giữ `@SkipThrottle()`.

3. **Khoá đếm theo người dùng sau xác thực**: `HttpThrottlerGuard` override `getTracker` —
   request có `Authorization: Bearer <token>` thì `JwtService.verifyAsync(token)` và trả
   `user:<sub>` khi `sub` là chuỗi không rỗng; mọi trường hợp khác (thiếu header, token sai/hết
   hạn, `sub` rỗng) rơi về `super.getTracker(req)` tức IP đã chuẩn hoá IPv6.
   **Không bao giờ đọc payload trước khi verify**: một `sub` bịa trong token rác sẽ tạo bucket mới
   cho mỗi request, vô hiệu hoá rate limit. Không khoá theo tham số query (`?user=` của
   `/attachments/:id/file`) vì client tự đặt được giá trị — đúng lỗ hổng đó.
   `getTracker` không bao giờ ném: mọi lỗi verify đều là "về IP".

4. **`@RateLimitByIp()`** (`common/decorators.ts`) buộc bucket bỏ qua danh tính người dùng. Áp cho
   `/attachments/:id/file` + `/download` (byte tệp khoá theo IP, không tách mỗi người một hạn mức;
   mỗi handler vẫn giữ bộ đếm riêng như mặc định của thư viện) và `AuthController`
   (`/auth/login`, `/register`, `/refresh`, `/logout`) — người gọi chưa có token thật; khoá theo IP
   mới chặn được dò mật khẩu từ một máy.

5. **Hợp đồng header không đổi**: chỉ một throttler tên `default`, nên header vẫn là
   `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` không hậu tố.
   Bổ sung: 429 do guard trả thêm `X-RateLimit-Limit` và `X-RateLimit-Remaining: 0` của bucket
   vừa cạn (trước đây chỉ có `Retry-After`) để client biết bucket nào hỏng mà không phải đoán.

6. **Fail-open/fail-closed giữ nguyên** (ADR-0026): Redis chết thì mặc định cho qua, riêng
   `@RateLimitFailClosed()` (login, register, refresh) trả 503.

## Phương án đã loại

- **Giữ nguyên 100/phút, khoá 60 giây.** Rẻ nhất nhưng đúng là nguyên nhân khiến một burst đọc
  nhẹ khoá cả phút; đo ở ADR-0077/0078 cho thấy web bắn hàng chục request mỗi lần tải trang.
- **Chỉ đổi khoá sang người dùng, giữ một hạn mức.** Người dùng chung IP không còn giành hạn mức,
  nhưng upload và đọc unread vẫn chung trần và vẫn khoá 60 giây.
- **Nhiều throttler có tên (`short`, `default`, `long`) thay vì một bucket cho mỗi nhóm route.**
  Header sẽ thành `X-RateLimit-Limit-short`, `-long`… đúng lúc web chỉ đọc tên không hậu tố
  (ADR-0078) → vỡ hợp đồng im lặng. Muốn nhiều tầng phải sửa cả client trước.
- **Sliding window / token bucket.** Chính xác hơn fixed window ở biên, nhưng phải viết lại script
  Lua + storage và đo lại; chưa có bằng chứng fixed window theo bucket là nút thắt.
- **Khoá theo `sessionId` (`sid`).** Mỗi lần refresh tạo session mới là một bucket mới, và một
  người có nhiều tab/thiết bị sẽ nhân hạn mức. `sub` mới là danh tính ổn định.

## Consequences

- Một đợt đọc nhẹ (unread, permissions, members) không còn bị upload hay gửi tin làm nghẽn; ngược
  lại, ghi cấu trúc bị chặn ở 20/phút dù đọc vẫn chạy.
- 429 chỉ khoá 2–10 giây (trừ login/register 60 giây), nên client ADR-0078 chờ ngắn rồi gửi tiếp;
  không còn cảnh "một burst = một phút chết".
- Hai người chung IP có bucket riêng sau khi đăng nhập; người chưa đăng nhập hoặc token hỏng vẫn
  đếm theo IP—kẻ tấn công không tạo được bucket vô hạn bằng token bịa.
- **Mỗi request có token bị verify hai lần** (guard này rồi `JwtAuthGuard`). HMAC verify rất rẻ so
  với truy vấn DB của chính request đó; đổi lại guard biết danh tính trước khi service chạy. Nếu
  sau này đo thấy đáng kể, cache kết quả verify theo request (WeakMap trên `req`).
- **Service-level limiter vẫn là trần thật cho flood nội dung**: `MessageRateLimiter` 10 tin/10
  giây/user/channel, `SearchRateLimiter` 30/phút/user, `GifRateLimiter`, `AskRateLimiter`. Bucket
  `writeMessage` 60/10 giây rộng hơn có chủ đích — nó chặn client hỏng, không thay các limiter
  nghiệp vụ (chúng chạy sau xác thực và biết `channelId`).
- **e2e vẫn phải `fileParallelism: false` / `workers: 1`**: bucket `/auth/*` và attachment khoá
  theo IP, mà mọi spec chạy từ `127.0.0.1`, nên các file song song sẽ giành cùng bộ đếm đăng ký
  (5/phút) và đọc tệp. Bucket theo người dùng không cứu được hai nhóm này.
- Route mới mặc định rơi vào lưới hứng 100/phút; muốn hạn mức riêng phải khai `@Throttle` với
  `RATE_LIMIT_BUCKETS` — thêm dòng vào bảng trên khi tạo nhóm mới.
