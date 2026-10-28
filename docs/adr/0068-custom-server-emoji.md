# ADR-0068: Emoji tùy chỉnh theo server (custom emoji)

Status: accepted — kế hoạch TG.24 được OWNER duyệt trong phiên 2026-10-28 ("tiếp đi" sau khi
đọc tóm tắt ADR; bắt đầu triển khai ngay trong phiên)
Date: 2026-10-28

## Context

TG.24 cần emoji tùy chỉnh theo server: tải lên qua pipeline TG.6, dùng được trong **tin nhắn lẫn
reaction**, render qua AST của TG.4, tối đa 50 tĩnh + 50 động/server, quyền `MANAGE_EXPRESSIONS`
(đã có từ TG.22/ADR-0067), event `expressions.updated` đồng bộ hai tab, xóa emoji → placeholder.

Ràng buộc hiện có:

- Token emoji hệ thống trong TG.4 là `:([a-z_]{2,20}):` tra `SHORTCODE_TO_UNICODE` (map tĩnh);
  emoji tùy chỉnh là dữ liệu theo server nên KHÔNG thể nằm trong map tĩnh này.
- Reaction lưu chuỗi unicode ≤ 32 ký tự qua allowlist `reactionEmojiSchema` (shared) — token
  custom emoji (tên + id) dài hơn 32 nên cần dạng token riêng gọn.
- Pipeline TG.6 kiểm định tách nhánh theo scope; TG.22 đã mở đường ảnh động (`validateStickerFile`).
- `Attachment.scope` là cột String (không enum) nên thêm scope không cần migration đắt.

## Decision

1. **Model**: `CustomEmoji { id, serverId, name (1–32, [a-z0-9_] sau chuẩn hóa), animated
Boolean, attachmentId unique FK Attachment, createdBy (cột trần), deletedAt, createdAt }`,
   index `(serverId, deletedAt)`. Không bảng gói — emoji của server phẳng (plan không yêu cầu
   gói cho emoji; gói là khái niệm của sticker TG.22).
2. **Upload**: scope mới `'customEmoji'` — tệp gốc ≤ `EMOJI_FILE_BYTES = 256 KiB`, bắt buộc
   serverId; kiểm định tái dùng luồng sticker với tham số riêng: xuất WebP ≤ **128×128** (chuẩn
   custom emoji), tĩnh lẫn động, kèm khung tĩnh `.thumb` cho reduced-motion. Trần **50 tĩnh +
   50 động**/server giữ bằng advisory lock `emoji-server:<id>` (pattern trần sticker), vượt →
   `EMOJI_LIMIT_REACHED` (400, kèm details bucket tĩnh/động). Xóa mềm + audit `EMOJI_DELETE`
   (quy tắc 11) + phát hành tệp như sticker; sticker hệ thống không đụng tới nhánh này.
3. **Token trong tin**: lưu dạng `:ten:<id>` — id UUID là nguồn sự thật, tên chỉ dùng hiển thị
   fallback và gợi ý. Regex TG.4 mở rộng nhóm riêng `:([a-z0-9_]{2,32}):([0-9a-f-]{36})` thành
   node `{type:'customEmoji', id, name}`; KHÔNG sinh HTML. Khi gửi, API trích mọi token custom
   và chặn (400 `BAD_REQUEST`) id không tồn tại / đã xóa / thuộc server khác (IDOR: chỉ dùng
   emoji server mình thuộc); token của emoji đã xóa vẫn gửi được nhưng render placeholder
   `:ten:` dạng chip mờ (client tự resolve qua cache, không cần đụng API khi gửi).
4. **Reaction**: chuỗi lưu là `c:<customEmojiId>` (38 ký tự, phân biệt ngay bằng tiền tố `c:`);
   `reactionEmojiSchema` thêm nhánh nhận dạng này; API kiểm id thuộc server của tin và chưa
   xóa khi thả. Pill reaction với token `c:` render ảnh (≤20px) thay vì unicode; danh sách
   người thả/picker reaction (tái dùng EmojiPicker) hiển thị ảnh tương tự.
5. **API**: `POST /servers/:serverId/emojis` (ability `manage Sticker` — dùng lại bit
   `MANAGE_EXPRESSIONS`, không thêm subject mới: subject CASL vẫn là 'Sticker' vì cùng nhóm
   biểu cảm; KHÔNG mở rộng `defineAbilityFor`), `GET /servers/:serverId/emojis` (`view Sticker`
   — mọi member), `DELETE /emojis/:emojiId` (guard tra server qua `:emojiId` — thêm nhánh
   AbilityGuard; gói không tồn tại khái niệm hệ thống nên mọi emoji đều xóa được bởi manager).
6. **Event**: `expressions.updated { serverId }` phát tới room `server:<id>` sau tạo/xóa emoji
   (và sticker tạo/xóa — thống nhất một event cho cả biểu cảm): client invalidate
   `qk.stickers` + `qk.emojis` → hai tab tự đồng bộ. Picker emoji (TG.23) thêm tab "Của server"
   (ảnh ≤20px, chọn → chèn token `:ten:<id>` tại con trỏ); gợi ý `:ten:` trong composer gộp
   thêm tên emoji server (tìm không dấu `foldVi` tái dùng).
7. **Render**: `MarkdownText` resolve node `customEmoji` qua query `qk.emojiMap(serverId)`
   (một GET trả `{id,name,url,previewUrl,animated,deleted}` cho server, staleTime 5 phút, cùng
   event invalidate); thiếu/đã xóa → placeholder chip `:ten:`. Tin "chỉ emoji" lớn (TG.23) chỉ
   áp dụng cho emoji Unicode — custom emoji giữ kích thước inline 20px.

## Alternatives

- Cho custom emoji vào `SHORTCODE_TO_UNICODE` theo server: map tĩnh vào bundle, lệch kiến trúc
  ADR-0057 (nguồn duy nhất), loại.
- Token chỉ tên không id (`:ten:`): trùng tên giữa các emoji và hệ thống, không quy chiếu được
  sau khi đổi tên/xóa, chấp nhận nhiều emoji cùng tên nhưng sai ngữ nghĩa "nguồn sự thật là
  id" của reaction — loại.
- Reaction lưu token đầy đủ `:ten:<id>` (~70 ký tự): vượt trần 32 hiện hữu vô lý, dữ liệu
  reaction phình vô ích — `c:<id>` gọn hơn, loại.
- Subject CASL mới 'Emoji': thêm subject + rule chỉ để tái dùng đúng một bit quyền đã có
  (`MANAGE_EXPRESSIONS` của TG.22) — dư thừa, dùng lại 'Sticker', loại.

## Consequences

- `Message.content` chứa token kỹ thuật (`:ten:<id>`) — tìm kiếm FTS (T4.6) đánh chỉ mục cả
  token: chấp nhận (Discord cũng vậy); announce/unread không đổi (nội dung văn bản thuần).
- Migration expand duy nhất: bảng `CustomEmoji` + index (scope attachment là String nên chỉ
  thêm nhánh validation, không đụng DB).
- Nhánh kiểm định trong worker nhận tham số `(maxBytes, maxEdge)` chung cho sticker/emoji —
  bớt sao chép; behavior sticker không đổi.
- `expressions.updated` là event đầu tiên phủ nhiều loại tài nguyên (emoji + sticker) — tên
  tổng quát từ đầu để TG.24 không phải thêm event thứ hai.
- E2E: API (upload → dùng trong tin → reaction → trần 50/50 → IDOR token chéo server → xóa →
  placeholder → event hai tab) + web (picker tab server, gợi ý, reaction pill ảnh, hai tab đồng
  bộ qua event).
