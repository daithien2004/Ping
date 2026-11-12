# ADR-0088: URL công khai kiểu Discord — `/channels/{serverId|@me}/{channelId}[/{messageId}]`

Status: accepted — OWNER chọn theo cách tiếp cận của Discord
Date: 2026-11-12

## Context

OWNER đối chiếu URL Ping với Discord và thấy hai dạng khác nhau: Discord dùng
`/channels/{guildId}/{channelId}[/{messageId}]` cho kênh server và `/channels/@me/{channelId}` cho
DM. Ping trước ADR này dùng `/servers/:serverId/channels/:channelId/messages/:messageId` và
`/dms/:channelId/messages/:messageId` — URL phản ánh **layout nội bộ** (khung server vs khung DM)
chứ không phản ánh một kênh.

Vì sao Discord dùng một ngữ pháp duy nhất: mọi thứ chứa tin nhắn đều là **channel** (kênh chữ,
thread, forum, voice), nên một ô chủ sở hữu + một id kênh là đủ; DM không thuộc guild nào nên ô
chủ sở hữu là sentinel `@me` (“người đang đăng nhập”, không phải id người dùng). Nhờ vậy cùng một
link dùng được cho mọi loại kênh, đổi loại kênh không đổi dạng URL, và link chia sẻ không lộ cấu
trúc route của app.

Ràng buộc phía Ping:

- Route nội bộ `/servers/[serverId]/...` và `/dms/[channelId]` đang gắn với hai khung layout, hai
  ability provider (`ServerAbilityProvider`, `DmAbilityProvider`) và `<Activity>` giữ trang cũ ẩn
  (nháp, upload, DOM, vị trí cuộn). Gộp cây route là thay đổi lớn, dễ tái phát lỗi ADR-0020.
- Page đọc `params` từ prop do server tính; chỉ mã cấp layout (rail, sidebar, realtime provider,
  quick switcher) mới cần đọc id từ URL phía client.
- Liên kết đã phát hành (permalink cũ, `?m=`, bookmark) không được chết.
- URL API không nằm trong phạm vi: `/servers/:id/channels`, `/channels/:id/messages`, `/dms` giữ
  nguyên.

## Decision

**URL công khai theo ngữ pháp của Discord; route nội bộ giữ nguyên và được nối bằng rewrite.**

1. **Ngữ pháp công khai**: `/channels/{serverId|@me}/{channelId}[/{messageId}]`.
   - DM là `/channels/@me/{channelId}`; danh sách DM là `/channels/@me`.
   - Không còn đoạn `/messages/` trước id tin — id tin là đoạn thứ ba, đúng như Discord.
   - `/servers` (landing chọn server đầu tiên) và `/servers/:serverId/settings` giữ nguyên; cài đặt
     server là route ba đoạn nên không khớp ngữ pháp kênh và không bị chuyển hướng.
2. **Một nguồn dựng/đọc URL**: `lib/channel-url.ts` là nơi duy nhất biết `@me`, dựng
   `ownerUrl`/`channelUrl`/`messageUrl` và phân tích pathname (`serverIdFromPath`,
   `channelIdFromPath`, `isDmPath`). `features/servers/navigation.ts` và
   `features/dms/navigation.ts` chỉ gọi lại; mọi chỗ sinh link dùng các helper này.
3. **Chuyển hướng 308 cho URL cũ**, khai báo trong `next.config.ts`: `/dms[/...]`,
   `/servers/:serverId`,
   `/servers/:serverId/channels/:channelId[/messages/:messageId]` → dạng mới. Query được giữ nên
   `?m=` alias của ADR-0063 vẫn hoạt động.
4. **Rewrite URL mới về route nội bộ** (afterFiles): `/channels/@me/...` → `/dms/...`,
   `/channels/:serverId/...` → `/servers/:serverId/...`. Next chạy redirect trước rewrite nên đích
   rewrite không bị chuyển hướng ngược; rule literal `@me` đặt trước rule `:serverId` để không bị
   nuốt. Nhờ vậy layout, `params` của page và hành vi `<Activity>` không đổi.
5. **Mã cấp layout đọc id từ `usePathname()`** qua helper, không dùng `useParams()`: `useParams()`
   trong layout bị `<Activity>` giữ ẩn trả params của URL hiện tại (ADR-0020). Page vẫn nhận
   `params` từ prop vì đó là dữ liệu server tính cho đúng route đích của rewrite.

## Alternatives

- **Gộp thành cây route thật `/channels/[owner]/[channelId]`**: phải chọn layout theo `owner` sau
  khi đã vào route, làm yếu ranh giới `ServerAbilityProvider`/`DmAbilityProvider` và vùng Suspense;
  thư mục `@me` còn đụng cú pháp `@folder` (parallel routes) của Next. Rewrite đạt cùng URL công
  khai mà không đụng cây layout.
- **Tham số có ràng buộc regex cho `@me`** (một param `owner` thay cho hai rule): ràng buộc của
  Next áp lên đích rewrite, không áp lên nguồn; rule literal đơn giản và rõ thứ tự hơn.
- **Chuyển hướng phía client** (`router.replace` sau hydrate): URL cũ hiện một nhịp rồi mới đổi,
  link chia sẻ/prefetch vẫn trỏ URL cũ, và tốn một vòng render. 308 ở tầng server rẻ và đúng nghĩa
  “địa chỉ mới cố định”.
- **Đổi hẳn route nội bộ sang `/channels` rồi sửa mọi consumer `params`**: diff lớn, dễ tái phát
  lỗi ẩn/`undefined` của `<Activity>`, không thêm giá trị người dùng.
- **Giữ `/messages/` trong permalink**: trái ngữ pháp Discord, và làm “đường dẫn kênh” phụ thuộc
  việc đang mở tin hay không.

## Consequences

- Mọi URL công khai của kênh/tin có một dạng; link Discord-style dán vào Ping mở đúng chỗ.
- Link cũ vẫn sống (308 vĩnh viễn, giữ query); sau này có thể bỏ rule redirect khi hết link cũ.
- `@me` không thể trùng id thật: id của Ping là UUIDv7.
- URL API và hợp đồng backend không đổi; chỉ route trình duyệt đổi.
- `/channels/:serverId` vẫn render trang gốc server rồi `ChannelRedirect` sang kênh đầu — giống
  `/servers/:id` trước đây, hai bước phía client.
- Quy ước mới: link mới phải đi qua `lib/channel-url.ts`; mã layout không dùng `useParams()`; test
  e2e khẳng định URL dạng `/channels/...` và có bước kiểm 308 từ URL cũ (`leave-server`, `permalink`).
- Nếu Next đổi thứ tự redirect/rewrite hoặc cách khớp rule, phải rà lại `next.config.ts`; unit test
  của helper và e2e permalink/DM là lưới chặn.
