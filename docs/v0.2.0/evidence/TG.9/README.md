# Evidence TG.9 — DM 1:1 và chặn người dùng

- Ngày: 2026-10-29 (Asia/Saigon); nhánh `feat/tg9-dm`; base `300441f` (main sau TG.25).
- Thiết kế: [ADR-0070](../../../adr/0070-dm-and-user-blocks.md) — duyệt theo ủy quyền của
  OWNER trong phiên 2026-10-29 ("tự viết plan rồi tự duyệt đi coi như tôi duyệt... cho phép
  merge, push luôn"), mọi quyết định ghi vết trong ADR.
- Lệch số với bảng kế hoạch: plan pre-assign ADR-0052; theo luật đánh số tại plan:240, ADR
  thực tế là **0070** (kế tiếp thư mục docs/adr/).

## Đã giao

**Shared** (commit `cc18a79`):

- `schemas/dm.ts`: `DM_ALLOW_VALUES = ['server_members','none']` (`'all'` chờ TG.15),
  `dmAllowSchema`, `updatePrivacySchema`, `createDmSchema {userId}`, `DmSummary
{channelId, partner, unreadCount, lastReadMessageId, lastMessageAt}`, `DmListResponse`;
  mã `DM_BLOCKED` (một mã chung cho "bị chặn" và "tắt DM" — chống dò nguyên nhân);
  `ChannelActivityPayload.serverId` mở `string | null` (badge DM qua room `user:<id>`).
  Shared unit **61/61** (+3).

**API** (commit sau review):

- Migration expand `20261029025249_tg9_dm_and_blocks`: `ChannelType` + `'DM'`, drop NOT NULL
  `Channel.serverId`, `Channel.dmKey` unique (cặp UUID chuẩn hóa min|max), `DmParticipant
{channelId, userId, lastReadMessageId?, createdAt}` (PK cặp, index userId), `UserBlock
{blockerId, blockedId}` (PK cặp, index blockedId), `User.dmAllow default 'server_members'`;
  `migrate status` in sync; `prisma generate` chạy ngay sau migrate (gotcha client ESM).
- `POST /dms` get-or-create idempotent: chuẩn hóa `dmKey` theo byte-order UUIDv7; cặp đã có →
  200 channel cũ (kể cả khi đang bị chặn — đọc tin cũ là chủ đích); tạo mới trong MỘT
  transaction kiểm: không DM chính mình → 400; **chung server bằng 1 truy vấn EXISTS giao
  Member** (không N+1); `dmAllow`; `UserBlock` hai chiều — vi phạm cùng 403 `DM_BLOCKED`;
  hai request song song cùng cặp → P2002 → trả existing 200 (luôn 200, không 409).
- Trần spam **10 DM mới/giờ/user** đếm DB trên `DmParticipant.createdAt` (429 kèm Retry-After).
- `GET /dms`: 1 raw query — partner + unreadCount cap 100 theo ngữ nghĩa `unreadForServer`
  qua `DmParticipant.lastReadMessageId` + `lastMessageAt` (null xếp sau).
- Block/unblock: `POST/DELETE /users/:userId/block` idempotent 204, self-block 400; không
  audit (AuditLog.serverId bắt buộc, DM không có bối cảnh server — ADR chấp nhận).
- **AbilityGuard refactor `resolveServerId` → `resolveContext`** (union server/dm/profile/
  none): channel DM → kiểm `DmParticipant`, không phải participant → **404 che tồn tại**
  (pattern tin-around); participant nhận `defineDmAbilityFor` (bổ sung mới trong shared —
  tầng ability chưa có khái niệm DM; hai participant ngang hàng, không role, cố ý KHÔNG có
  MANAGE_MESSAGES); **nhánh attachment `serverId` NULL trước đây bỏ qua kiểm (lỗ IDOR ADR
  chỉ đích danh) nay kiểm participant**; channel server có serverId NULL (lệch dữ liệu) → 404.
- Tin nhắn trong DM: `MessagesService.create` kiểm UserBlock author↔partner → 403
  `DM_BLOCKED`; sticker chặn sớm 400; token custom emoji sống → 400 tường minh (điều kiện
  `emoji.serverId !== channel.serverId` không định nghĩa khi NULL), token chết/không tồn tại
  vẫn 201 placeholder (theo ADR-0068); reaction token `c:<id>` ở DM → `REACTION_EMOJI_INVALID`;
  mention không ghi ở DM; GIF + attachment (scope message) hoạt động — ký URL attachment kiểm
  participant; pin/unpin cả hai participant, audit skip; tin chỉ tác giả xóa được.
- Realtime: `joinChannel` nhánh DM — kiểm participant, join duy nhất room `channel:<id>`,
  không room server; badge đối tác qua `emitToUser` + `ChannelActivity {serverId: null}`
  (tác giả không tự nhận badge).
- Read-state: `PUT /channels/:id/read` nhánh DM ghi `DmParticipant.lastReadMessageId`
  (chỉ tiến) + emit `read.updated`.
- AI: `MessageIndexerCore.syncMessage` skip khi `channel.serverId === NULL` (+ deletePoint
  phòng hờ) — backfill dùng chung lõi tự được phủ; FTS đã scope server, RAG hydrate theo server.
- `PATCH /users/me/privacy` (endpoint riêng — giữ nguyên hợp đồng PATCH /users/me của TG.7).
- IDOR: `ID_ROUTES` 45 → 47 (+2 block route); `/dms` không nằm bảng ID_ROUTES vì bảng quét
  route có `:id` — IDOR DM phủ trọn trong `dms.e2e-spec` (người ngoài 404 mọi route, không
  join được room).

**Web** (commit `036d313`):

- Route riêng `/dms` (danh sách) → `/dms/:channelId` (hội thoại) → `/dms/:channelId/messages/
:messageId` (permalink, mirror TG.5): route server bắt buộc `serverId` trong URL + bọc
  `ServerAbilityProvider` — DM không có server nên route riêng là phương án ít xâm phạm nhất;
  `MessagePane` tái dùng nguyên trạng qua chế độ `serverId: null` + `DmAbilityProvider` (dùng
  `defineDmAbilityFor` của shared; khi biết bị chặn rút rule `create Message` → composer tự
  tắt qua đúng luồng ability; sentinel `serverId: ''` disable mọi query theo server).
- Rail: mục DM + badge đỏ mention-style (mọi tin DM là mention-style như ADR), realtime qua
  `ChannelActivity {serverId: null}` + invalidate khi reconnect; sắp theo lastMessageAt.
- Profile card: BẬT nút "Nhắn tin" (trước đây tắt kèm ghi chú DM thuộc TG.9) — get-or-create →
  điều hướng vào DM; Chặn/Bỏ chặn Popconfirm ngay trong thẻ hồ sơ.
- Bị chặn: banner `role="status"` đầu pane + composer câu chung "cannotSend"; chiều bị chặn
  chỉ lộ sau lần gửi 403 đầu (chống dò khớp API). Ẩn nút sticker trong DM (ADR mục 10), GIF
  giữ. Danh sách chặn toàn cục + UI `dmAllow` để TG.13 (hook `useUpdatePrivacy` đã sẵn).
- i18n vi/en đủ key (`dms`, `errors.DM_BLOCKED`); a11y: `ul/li` + aria-label partner kèm số
  chưa đọc, badge rail có nhãn đếm.
- Vá 2 warning lint mới trong lúc commit: effect avatar trong profile card rã phần tử ổn định
  cho deps (nguyên object `upload`/`save` đổi identity mỗi render — thêm thẳng sẽ nổ mutation
  lặp khi lỗi); img gợi ý emoji thêm disable-line cùng pattern `draft-preview`.

## Kiểm chứng

| Hạng mục                           | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit                        | **61/61** (+3 DM)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| API unit                           | **238/238** (thêm 16: 15 dms.service + 1 indexer skip DM)                                                                                                                                                                                                                                                                                                                                                                                             |
| API e2e `dms`                      | **13/13 × 2 lần ổn định**: idempotent tuần tự + song song (Promise.all → 1 channel); không chung server / dmAllow none → 403 `DM_BLOCKED`; block chặn tin mới + đọc được tin cũ + unblock gửi lại; cap 10 → 429; IDOR người thứ ba 404 mọi route + attachment + không join được room; text/GIF/attachment OK + sticker 400 + token emoji 400; unread/markRead qua DmParticipant; realtime message.created + `ChannelActivity serverId: null`; AI skip |
| IDOR                               | 47 route (+2 block), pass                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Web unit                           | **221/221** (thêm 4 dm-cache: bump/read/sort/tổng unread)                                                                                                                                                                                                                                                                                                                                                                                             |
| Web e2e `dm`                       | **1/1 × 3 lần ổn định** (~40 s/lần, 3 context cùng run, baseline unread chốt + nội dung tin unique mỗi run): tạo DM từ profile card → gửi → render như tin thường; badge DM qua event; block qua UI → banner + composer tắt, đối tác gửi API → 403, unblock gửi lại OK; dmAllow none → 403 UI không nổ                                                                                                                                                |
| Full API e2e                       | **320/320 (38 file, 175 s)** — trước TG.9: 307/307 (37 file)                                                                                                                                                                                                                                                                                                                                                                                          |
| Full web e2e                       | **45 pass + 1 skip (18,1 phút)**; 3 fail trong run (admin-surface, permalink, unread-ui) là ô nhiễm DB dev từ một ngày chạy hỗn loạn — **cả 3 xanh khi chạy riêng** (tiền lệ TG.22/25), CI trên DB mới là phán quyết cuối                                                                                                                                                                                                                             |
| Lint/format/typecheck/build/bundle | lint 0 error cả 3 commit (hook pre-commit pass); prettier sạch; typecheck sạch; build prod web đạt; **bundle 247,1 KB ≤ 450 KB** (+0,2 KB so với TG.25)                                                                                                                                                                                                                                                                                               |
| Migration                          | `20261029025249_tg9_dm_and_blocks` apply, in sync; tạo bằng `migrate diff` + `deploy` (migrate dev cần TTY tương tác không có trong sandbox — SQL là đúng output diff engine)                                                                                                                                                                                                                                                                         |

## Lưu ý

- Trạng thái "đang chặn" v0.2: client nhớ theo phiên (zustand) + nhận biết qua 403
  `DM_BLOCKED`; sau reload nút trở về "Chặn" (POST idempotent nên an toàn) — danh sách chặn
  toàn cục thuộc TG.13.
- Thông điệp ngoài phạm vi TG.9 (ADR): không voice/video, không nhóm >2, không bạn bè;
  `dmAllow 'all'` chờ TG.15.
