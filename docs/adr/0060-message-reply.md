# ADR-0060: Reply — khoá ngoại tự thân `Message.replyToId`

Status: accepted — quyết định nằm trong kế hoạch Pha G (TG.1) được OWNER duyệt
Date: 2026-10-25

## Context

TG.1 cần trả lời một tin trong cùng channel: API nhận `replyToId`, payload tin nhắn kèm xem
trước tác giả + đoạn trích ngắn + cờ "đã xóa"; UI có thanh reply trong composer, khối trích dẫn
ở tin trả lời và bấm để nhảy tới tin gốc (TG.5 mở rộng cho tin chưa tải).

Ràng buộc: quyền đọc vẫn theo channel (ADR-0004/ADR-0003); tin gốc bị xóa mềm phải hiển thị
đúng là "đã bị xóa" chứ không lộ nội dung; không được trả lời tin ở channel/server khác (IDOR);
sửa tin gốc phải thấy nội dung mới (không lưu bản sao nội dung).

## Decision

**Một cột `replyToId UUID NULL` trên chính bảng `Message`, khoá ngoại tự thân
`ON DELETE SET NULL`, kèm kiểm tra "cùng channel" ở tầng service.**

- Migration expand-only `20261025140747_message_reply_to` (thêm cột + FK). Không backfill: tin
  cũ là `NULL` = tin thường.
- `MessagesService.create` đọc tin gốc trong **cùng transaction**, từ chối `400` nếu không tồn
  tại hoặc `channelId` khác. Soft-delete **vẫn cho** trả lời (giữ ngữ cảnh hội thoại).
- Mọi response/event trả `replyTo: { id, authorName, content, deleted } | null`; `content` cắt
  120 ký tự, `deleted = true` thì `content = ''`. Preview được **join tại thời điểm đọc**, không
  lưu bản sao, nên sửa tin gốc là preview đổi theo.
- `GET /channels/:id/messages` (cả `before` và `after`) và `POST/PATCH` đều map qua
  `toMessageDto` để không trả bản ghi thô (`deletedAt`, `author` lồng) ra ngoài.
- Xóa cứng tin gốc (hiện chỉ có xóa mềm qua API) sẽ `SET NULL` — tin trả lời trở thành tin
  thường thay vì bị xóa dây chuyền.

## Alternatives

- **Bảng `MessageReply` riêng**: thêm join + bảng cho quan hệ 1-1, không giải quyết được gì mà
  cột nullable không làm được; tăng độ phức tạp schema/migration.
- **Lưu snapshot nội dung tin gốc trong hàng trả lời**: preview không đổi khi tin gốc bị sửa,
  và nhân đôi dữ liệu người dùng; trái yêu cầu "sửa tin gốc thấy nội dung mới".
- **`ON DELETE CASCADE`**: xóa cứng tin gốc kéo theo xóa các tin trả lời — mất hội thoại.
- **Cho phép reply chéo channel**: vi phạm ranh giới quyền của channel; người đọc channel này
  có thể thấy trích đoạn của channel không được đọc.
- **Ràng buộc cùng channel bằng trigger/CHECK**: Postgres không biểu diễn được điều kiện liên
  hàng bằng CHECK; trigger khó test và khó rollback hơn kiểm tra trong transaction.

## Consequences

- Thêm một self-join khi đọc tin (chỉ lấy 4 cột) — chi phí nhỏ, có index PK của tin gốc.
- `replyToId` không có index riêng: chưa có truy vấn "các tin trả lời X"; nếu TG.3/TG.5 cần,
  thêm index trong migration sau.
- Preview là dữ liệu **suy ra**, nên event `message.created` mang preview tại thời điểm tạo;
  nếu tin gốc bị sửa sau đó, client chỉ thấy nội dung mới khi tải lại danh sách (chấp nhận —
  cùng cách xử lý với các dữ liệu suy ra khác trong chat, không thêm event riêng cho reply).
- Xóa mềm tin gốc không phát event riêng cho người đang giữ preview; danh sách tải lại sẽ thấy
  "đã bị xóa" (ghi ở phần giới hạn evidence TG.1).
- TG.5 dùng lại `replyTo.id` để mở permalink `?m=`; không cần đổi payload.
