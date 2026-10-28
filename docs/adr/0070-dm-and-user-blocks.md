# ADR-0070: DM 1:1 và chặn người dùng (DM + user blocks)

Status: accepted — duyệt theo ủy quyền của OWNER trong phiên 2026-10-29 ("tự viết plan rồi tự
duyệt đi coi như tôi duyệt... cho phép merge, push luôn"). Năm câu hỏi mở khi soạn đều giữ
nguyên đề xuất: `dmAllow` 2 giá trị ('all' chờ TG.15); cap 10 DM/giờ; chặn sticker + custom
emoji trong DM (tài sản server, validation token không định nghĩa khi serverId NULL); một mã
`DM_BLOCKED` chung chống dò nguyên nhân; đánh số 0070 theo luật tại plan:240.
Date: 2026-10-29

## Context

TG.9 (docs/ping-v0.2.0-plan.md:506, ràng buộc riêng tư Pha G tại :529) cần DM 1:1 ngoài server:
`Channel` loại DM không `serverId` + participant, tái dùng message/read-state/outbox, `POST /dms`
get-or-create idempotent, điều kiện cho phép (chung server, đối phương cho phép DM, chưa bị chặn),
`UserBlock`, giới hạn DM mới/giờ, mục DM ở thanh bên, **DM không được index cho tìm kiếm AI**.
Plan pre-assign số ADR-0052 (:233) nhưng theo luật đánh số tại :240 ("số thực tế lệch thì đánh số
tiếp theo trong docs/adr/") nên ADR này là 0070.

Hiện trạng trong code — không phải thứ nào cũng "tái dùng miễn phí" như plan giả định:

- `Channel.serverId` bắt buộc (apps/api/prisma/schema.prisma:174), `ChannelType` chỉ có `TEXT`
  (schema.prisma:187-190); KHÔNG tồn tại `ChannelMember` — membership là `Member` theo server
  (schema.prisma:105-124). `ChannelReadState` khóa `memberId` — FK tới `Member`
  (schema.prisma:129,134) nên participant DM không có hàng Member, không tái dùng được nguyên trạng.
- `Message`, `OutboxEvent`, reaction, pin, reply neo `channelId` (schema.prisma:194) — core
  pipeline tin nhắn tái dùng thật sự miễn phí.
- `AbilityGuard` resolve serverId từ params: channelId (ability.guard.ts:87-96), messageId
  (:97-106), attachment trả `serverId` hoặc **null để bỏ qua** (:74-83); channel không có
  serverId rơi vào fail-closed (:49-56).
- Indexer AI embed mọi `message.created` theo `channel.serverId`
  (ai/indexer/message-indexer.core.ts:52-104); `AuditLog.serverId` bắt buộc (schema.prisma:383)
  — DM không có chỗ ghi audit.

## Decision

1. **Model**: `Channel` mở rộng — `serverId String?` (nullable), enum `ChannelType` thêm `DM`,
   cột `dmKey String? @unique` = `"min|max"` hai UUID participant đã chuẩn hóa thứ tự; bảng
   `DmParticipant { channelId, userId, lastReadMessageId?, createdAt }` (PK cặp, index userId)
   và `UserBlock { blockerId, blockedId }` (PK cặp, index blockedId); cột `User.dmAllow String
@default("server_members")` chỉ nhận `'server_members' | 'none'`. CHỌN bảng participant riêng
   (không có ChannelMember để tái dùng; read-state polymorphic là FK hai mục tiêu trên một khóa):
   con trỏ `lastReadMessageId` theo ngữ nghĩa ADR-0043 đặt thẳng trên participant — một bảng cho
   cả quyền lẫn unread.
2. **Get-or-create idempotent**: `POST /dms {userId}` chuẩn hóa cặp (min/max UUID) thành `dmKey`;
   cặp đã có → **200 với channel tồn tại** (đọc tin cũ vẫn là chủ đích; gửi tin mới bị chặn ở
   mục 4); chưa có → transaction kiểm điều kiện (mục 3) rồi tạo Channel (type DM, `name = ''`,
   serverId NULL) + 2 hàng DmParticipant. Hai request song song: hàng sau chạm unique `dmKey` →
   bắt unique-constraint (pattern nonce, schema.prisma:243-245) và trả existing — luôn 200, không 409.
3. **Điều kiện cho phép** (chỉ khi tạo cặp mới): (a) không DM chính mình; (b) **chung server**
   bằng MỘT truy vấn `EXISTS (SELECT 1 FROM "Member" m1 JOIN "Member" m2 ON m1."serverId" =
m2."serverId" WHERE m1."userId" = me AND m2."userId" = target)` — `@@index([userId])`
   (schema.prisma:121), không N+1; (c) `target.dmAllow = 'server_members'`; (d) chưa có
   `UserBlock` theo bất kỳ chiều nào. Vi phạm (c)/(d) → 403 mã mới **`DM_BLOCKED`** (thêm vào packages/shared/src/errors.ts:5-35).
4. **UserBlock hai mức**: chặn tạo DM mới (mục 3) VÀ chặn tin mới trong DM có sẵn — nhánh create
   của MessagesService khi channel là DM kiểm block giữa author và đối tác → 403 `DM_BLOCKED`
   (cùng mã cho "bị chặn" lẫn "tắt DM" để không dò nguyên nhân); tin cũ vẫn đọc được; unblock →
   gửi được lại ngay (kiểm tại thời điểm gửi).
5. **Trần spam**: tối đa **10 DM mới/giờ/user** — đếm `SELECT count(*) FROM "DmParticipant"
WHERE "userId" = me AND "createdAt" > now() - interval '1 hour'` (index mục 1): đếm DM THẬT
   được tạo, không mất trạng thái khi Redis restart, vượt → 429 `TOO_MANY_REQUESTS`. Không tái
   dùng RedisThrottlerStorage của MessageRateLimiter (messages/message-rate-limiter.ts:26-44) vì
   bản chất khác: đếm DM mới chứ không phải tin.
6. **Realtime**: room `channel:<id>` giữ nguyên — `joinChannel` thêm nhánh DM: kiểm
   DmParticipant thay vì ability, join duy nhất room channel, không room server
   (realtime.gateway.ts:241). Participant join room **khi mở hội thoại**; badge realtime qua
   `emitToUser` (realtime.service.ts:50-58) tới room `user:<đối tác>` tái dùng event
   `ChannelActivity` với `serverId: null` (shared nới DTO).
7. **Sidebar + unread**: `GET /dms` trả danh sách DM của người gọi (kèm user đối tác) với
   `unreadCount`/`lastReadMessageId` cap 100 theo công thức `unreadForServer`
   (channels/read-state.service.ts:87-116) nhưng qua DmParticipant; đánh dấu đã đọc tái dùng
   `PUT /channels/:id/read` — `markRead` thêm nhánh ghi `DmParticipant.lastReadMessageId`.
   **Mention trong DM**: không ghi `MessageMention` (Member-scoped, schema.prisma:149) — mọi tin
   chưa đọc hiển thị badge đỏ mention-style như Discord; web thêm mục DM trên app shell (ngoài
   `ChannelSidebar` per-server, features/channels/components/channel-sidebar.tsx:16).
8. **Quyền và IDOR**: KHÔNG tạo namespace `/dms/:id/messages` — tin/reaction/pin/read đi qua
   đúng các route `/channels/:id/*` hiện hữu (messages.controller.ts:53-115) vì toàn bộ neo
   channelId; `AbilityGuard` thêm nhánh DM tại ba chỗ resolve (ability.guard.ts:87-96 channelId,
   :97-106 messageId, :74-83 attachment): channel là DM → kiểm participant, không phải
   participant → **404** (che tồn tại, pattern messages.service.ts:302). Nhánh attachment trả
   null hiện tại (:81) PHẢI đổi thành kiểm participant khi `serverId = NULL` — để nguyên là lỗ
   IDOR tải tệp DM. `ID_ROUTES` e2e thêm `POST /dms` + `GET /dms` (test/idor.e2e-spec.ts:24,634-647);
   threat model cập nhật "người ngoài không đọc DM, không join được room".
9. **AI exclusion**: chỗ thay đổi duy nhất là `MessageIndexerCore.syncMessage`
   (ai/indexer/message-indexer.core.ts:53-64): select thêm `channel.type` và nếu
   `channel.serverId = NULL` (DM) → bỏ qua, không embed; backfill dùng chung core (:20-21) nên
   được phủ cùng lúc. FTS đã scope theo serverId (messages/search.service.ts:36-48) và RAG T5.4
   hydrate theo server người hỏi — DM không lọt cả ba đường.
10. **Tin trong DM**: cho phép text + attachment (Attachment đã cho `serverId` NULL,
    schema.prisma:268 — ký URL kiểm participant thay vì server) và GIF TG.25; CHẶN sticker (tài
    sản server, messages.service.ts:387-405) và token custom emoji TG.24 (điều kiện
    `emoji.serverId !== channel.serverId` tại :416 không định nghĩa được khi serverId NULL).
    Chỉ tác giả xóa được tin của mình. **Ngoài phạm vi**: voice/video (ADR-0056), nhóm >2 người,
    bạn bè TG.15.
11. **Migration expand**: một migration — `ALTER TYPE "ChannelType" ADD VALUE 'DM'` (chạy ngoài
    transaction block của migrate), drop NOT NULL `Channel.serverId`, thêm `dmKey`, hai bảng
    mới, cột `User.dmAllow`. Rolling-safe: mọi query cũ lọc theo `serverId` nên DM vô hình với
    instance cũ. `dmAllow` nằm ở cài đặt Riêng tư TG.13 (plan :510) qua `PATCH /users/me`
    (users/users.controller.ts:27-29).

## Alternatives

- Bảng `DmChannel` riêng tách khỏi `Channel`: Message/Outbox/pin/reaction đều neo channelId,
  tách là copy cả pipeline tin nhắn — ngược yêu cầu "tái dùng" của plan — loại.
- 409 khi DM đã tồn tại: biến path thành công thành lỗi client phải bắt riêng, ngược pattern
  idempotent 200-existing của nonce — loại.
- Dùng `FORBIDDEN` chung thay vì `DM_BLOCKED`: client không phân biệt được để làm mờ composer —
  vi phạm quy tắc 14 (client rẽ nhánh theo code) — loại.
- Redis INCR/TTL (pattern MessageRateLimiter): đếm attempt chứ không phải DM thật và mất trạng
  thái khi restart — DB count trên `DmParticipant.createdAt` chính xác, vẫn chỉ một truy vấn index — loại.
- Join room DM cho mọi participant ngay lúc kết nối (realtime.gateway.ts:131-144): room phình
  theo tổng DM trong khi badge đã đi qua room `user:<id>`; join lúc mở hội thoại là đủ — loại.

## Consequences

- `Channel.serverId` nullable là thay đổi kiểu rộng nhất: mọi chỗ select `channel.serverId` và
  giả định non-null (messages.service.ts:358-365, :706-709…) phải qua nhánh DM hoặc chứng minh
  không gặp DM — TypeScript bắt được nhờ kiểu `string | null`.
- Tin DM không vào FTS server-scope, không vào vector AI, không có audit — chấp nhận vì DM là
  bề mặt riêng tư (Pha G); kiểm duyệt DM ngoài phạm vi v0.2. Badge DM realtime phụ thuộc
  `emitToUser` (best-effort như presence) — client đối soát lại qua `GET /dms` khi reconnect.
- E2E hai người dùng: tạo DM idempotent (2 request song song → 1 channel); dmAllow/chung server;
  block chặn tin mới nhưng đọc được tin cũ; cap 10/giờ → 429; IDOR người thứ ba → 404 mọi route,
  không join được room; DM không có trong search/ask.
- Mở tương lai: `dmAllow` thêm `'all'` khi TG.15 (bạn bè) tạo đường gặp user ngoài server chung;
  enum `ChannelType` đã chừa sẵn `VOICE, ANNOUNCEMENT` (schema.prisma:189).
