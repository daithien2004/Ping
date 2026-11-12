# ADR-0086: Reply ping tác giả tin gốc và ngữ cảnh preview cho sticker/GIF/tệp

Status: accepted
Date: 2026-11-12

## Context

ADR-0060 đã chốt cơ chế reply (`replyToId`, preview join tại thời điểm đọc), nhưng so với
client Discord còn hai khoảng trống người dùng thấy rõ:

1. Khi trả lời, client Discord báo cho tác giả tin gốc (mention trong unread); thanh reply chỉ
   có nút `X` huỷ reply, không có công tắc tắt ping. Ping chưa ping nên tin trả lời dễ bị bỏ qua.
2. `MessageReplyPreview.content` rỗng với tin gốc là sticker, GIF hoặc chỉ có tệp đính kèm, nên
   khối trích dẫn hiện một dòng trắng — người đọc không biết đang trả lời cái gì.

Ràng buộc: mention đã có bảng `MessageMention` riêng, đếm unread/mention dựa trên bảng này
(ADR-0070: DM không có `MessageMention`); không ping khi người gửi tự trả lời mình; tin gốc đã
xóa mềm thì không ping (nội dung đã bị ẩn); sửa tin không được làm rơi reply ping; hợp đồng DTO
thêm trường phải không phá client cũ.

## Decision

**Mọi reply trong server đều tạo một hàng `MessageMention(kind = 'user')` trỏ tới tác giả tin
gốc; không có công tắc ping trên UI. Preview bổ sung `kind` và `attachmentCount`.**

- Server tạo hàng mention reply ping cùng transaction với tin nhắn khi: không phải DM, tin gốc
  chưa xóa mềm, và tác giả tin gốc khác người gửi. Nếu nội dung đã `@` đúng tác giả đó thì không
  thêm hàng trùng (bảng mention có unique theo `[messageId, kind, mentionedMemberId, roleId]`).
- Thanh reply giữ đúng bố cục client Discord: tiêu đề "Đang trả lời {author}", đoạn trích, một
  nút `X` huỷ reply. Không thêm nút `@ ON/OFF`: trường `allowed_mentions.replied_user` của API
  Discord không có điều khiển tương ứng trong client hiện tại.
- Dùng chung `MessageMention` thay vì cột riêng để unread mention, `mention.created` và danh sách
  thông báo có sẵn xử lý reply ping như mention thường.
- `PATCH /messages/:id`: mention được parse lại từ nội dung. Trước khi `deleteMany`, service ghi
  nhớ hàng reply ping đang có và gắn lại sau khi parse, nên sửa nội dung không âm thầm gỡ ping.
  Sửa tin không phát lại `mention.created`, nên tin cũ chưa từng có hàng ping sẽ không tự sinh.
- `MessageReplyPreview` thêm `kind?: 'text' | 'sticker' | 'gif'` và `attachmentCount?: number`
  (chỉ có khi > 0, chỉ đếm tệp `status = 'ready'`; tin đã xóa thì `0`). Trường optional nên
  client cũ bỏ qua được. Web hiển thị nhãn "Sticker"/"GIF"/"{count} tệp đính kèm" khi `content`
  rỗng.
- Preview do client dựng từ cache (`replyPreviewOf`) cũng điền `kind`/`attachmentCount` để bản
  tạm lạc quan hiển thị giống bản server.

## Alternatives

- **Công tắc `@ ON/OFF` trên thanh reply**: không khớp client Discord hiện tại (thanh reply chỉ
  có `X`); thêm một nút cạnh `X` dễ bị hiểu là trùng chức năng, trong khi Ping chưa có nhu cầu
  trả lời im lặng.
- **Cột `replyPingAuthorId` hoặc bảng reply ping riêng**: phải thêm một nguồn thứ hai cho unread
  mention, đồng bộ với `MessageMention` ở mọi truy vấn đếm và mọi event; không có lợi ích.
- **Ping bằng mention ẩn trong nội dung (`@user` chèn tự động)**: sửa nội dung người dùng gõ, lộ
  ký tự trong bản sửa, và parser phải phân biệt mention do máy chèn.
- **Lưu snapshot mô tả loại tin gốc trong hàng trả lời**: trái ADR-0060 (preview suy ra khi đọc);
  `kind` đọc từ chính tin gốc vẫn đúng sau khi sửa.
- **Trả cả URL sticker/GIF trong preview**: nhân đôi dữ liệu media và kéo theo ký URL trong danh
  sách tin; nhãn loại là đủ để khối trích không trống.

## Consequences

- Reply vào tin của người khác giờ sinh thông báo mention; reply vào tin đã xóa hoặc tự trả lời
  mình thì im lặng. Muốn trả lời không ping thì chưa có đường UI — giống client Discord hiện tại.
- Sửa nội dung tin trả lời giữ reply ping, kể cả khi nội dung mới không còn `@` tác giả.
- Client cũ không hiểu `kind`/`attachmentCount` vẫn chạy; chúng chỉ là trường optional trong DTO.
- Preview hiển thị `kind` của tin gốc tại thời điểm đọc, nên tin gốc đổi loại (không xảy ra qua
  API hiện tại) sẽ đổi theo — cùng nguyên tắc "preview là dữ liệu suy ra" của ADR-0060.
