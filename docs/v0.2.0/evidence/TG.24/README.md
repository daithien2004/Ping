# Evidence TG.24 — Emoji tùy chỉnh theo server

- Ngày: 2026-10-28 (Asia/Saigon); base `f5931f3` (main sau TG.22), nhánh dự kiến
  `feat/tg24-custom-emoji`.
- Thiết kế: [ADR-0068](../../../adr/0068-custom-server-emoji.md) — **proposed, chờ OWNER duyệt**
  trước khi code (task lớn: model + token render + reaction + picker + quản trị + event + e2e).

## Khảo sát đã chốt (nguồn: khảo sát code 2026-10-28)

- **Parser TG.4** (`apps/web/src/features/messages/markdown.ts`): nhóm 8 trong regex inline là
  `:([a-z_]{2,20}):` → node `{type:'emoji', unicode}` qua `SHORTCODE_TO_UNICODE` (map tĩnh
  `features/emoji/map.ts`, nguồn duy nhất). Emoji tùy chỉnh phải là node riêng theo id — map
  tĩnh không chứa dữ liệu theo server.
- **Reaction (TG.2)**: `reactionEmojiSchema` (packages/shared/src/emoji.ts) allowlist unicode +
  skin tone; cột `MessageReaction.emoji` chuỗi ≤ 32. Token `c:<id>` (38 ký tự) cần nhánh riêng
  của schema + kiểm membership server ở service (pattern kiểm stickerId khi gửi tin TG.22).
- **Pipeline**: `validateStickerFile` (attachments/file-validation.ts) đã xử lý ảnh động + khung
  tĩnh với hằng số 512 KiB/512px — tham số hóa thành `(maxBytes, maxEdge)` dùng chung cho emoji
  (256 KiB/128px); scope mới `'customEmoji'` trong `createUploadSchema` (scope là String nên
  không cần migration); trần tính theo cờ `animated` (50 + 50).
- **Quyền**: bit `MANAGE_EXPRESSIONS = 4096n` + ability `manage Sticker`/`view Sticker` đã có
  từ TG.22 — tái dùng nguyên trạng, không thêm subject CASL.
- **Event**: `expressions.updated { serverId }` mới (room `server:<id>`), invalidate
  `qk.stickers` + `qk.emojis` — phủ đồng bộ hai tab cho cả emoji lẫn sticker.
- **Picker (TG.23)**: `EmojiPicker` đã được tái dùng cho reaction; thêm tab "Của server" với
  ảnh từ `GET /servers/:id/emojis`; gợi ý composer (`useEmojiSuggestions`) gộp tên custom,
  chèn token `:ten:<id>` tại con trỏ (`insertAtCursor` sẵn trong composer).
- **Render**: `MarkdownText` (memo theo content) cần map id→URL theo server — query
  `qk.emojiMap(serverId)` staleTime 5 phút + invalidate qua event; thiếu → chip `:ten:`.
- **IDOR/e2e**: route mới có ID vào `ID_ROUTES` (hiện 42 → dự kiến 45: POST/GET emojis +
  DELETE emoji); token chéo server → 400 khi gửi và khi thả reaction; trần 50/50 trả
  `EMOJI_LIMIT_REACHED`; e2e hai tab qua `expressions.updated`.

## Kế hoạch triển khai (khi OWNER duyệt ADR)

1. Shared + migration: `CustomEmoji`, scope `'customEmoji'` (256 KiB), mã `EMOJI_LIMIT_REACHED`,
   Limits 50/50, `expressions.updated` payload, `reactionEmojiSchema` nhánh `c:`, schema
   `customEmoji.ts` (create/list DTO, MessageReaction hỗ trợ token).
2. API: `POST/GET /servers/:id/emojis`, `DELETE /emojis/:id` (guard `:emojiId`), tham số hóa
   kiểm định, kiểm token khi gửi tin + khi thả reaction, audit `EMOJI_DELETE`, event.
3. Web: `features/emojis/` (api/hooks/cache), parser node `customEmoji` + render map, tab
   picker, gợi ý composer, reaction pill ảnh, quản trị chung mục Biểu cảm với sticker, i18n.
4. Kiểm chứng: test đỏ trước (schema token + trần + IDOR), full bộ lệnh chuẩn + e2e mới +
   ảnh, merge `--no-ff` theo pattern phiên.
