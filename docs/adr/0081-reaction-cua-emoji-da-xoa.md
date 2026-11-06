# ADR-0081: Reaction của emoji tùy chỉnh đã xóa

Status: accepted — phát sinh từ lỗi giao diện `c:<id>` trên playground, thi công phiên 2026-11-06
(kế hoạch: [Triển khai emoji đã xóa](../emoji-da-xoa-trien-khai.md)).
Date: 2026-11-06

## Context

Xóa emoji tùy chỉnh là soft-delete (`CustomEmoji.deletedAt`, ADR-0068): tin cũ vẫn chứa token
`:ten:<id>` và reaction cũ vẫn lưu `c:<id>`. Hai vấn đề lộ ra khi xem server có emoji đã xóa:

1. **Không gỡ được reaction của emoji đã xóa.** `removeReaction` dùng chung bước kiểm "emoji còn
   sống" với `addReaction`, nên người đã thả emoji X rồi X bị xóa bấm gỡ sẽ nhận 400
   `REACTION_EMOJI_INVALID`. Reaction mồ côi còn chiếm một trong `Limits.REACTIONS_PER_MESSAGE` (20)
   loại reaction của tin và không còn đường dọn.
2. **Pill hiện `c:<8 ký tự cuối>`** vì client không còn dữ liệu để dựng nhãn, trong khi tên emoji
   vẫn nằm trong CSDL.

Tài liệu Discord cho thấy reaction có thể sống lâu hơn emoji: đối tượng emoji trong reaction có thể
có `name: null` khi dữ liệu emoji đã mất, và tài liệu không mô tả việc tự xóa reaction khi xóa
emoji. Chưa có nguồn công khai về cách client Discord hiển thị trường hợp này.

## Decision

1. **Giữ reaction khi xóa emoji**, không xóa dây chuyền.
2. **Cho gỡ reaction của emoji đã xóa.** `assertCustomReactionEmoji` có tham số
   `allowDeleted`, chỉ `removeReaction` bật. Vẫn bắt buộc token thuộc đúng server của tin (kể cả
   emoji đã xóa), nên token server khác hay id lạ vẫn nhận 400 như cũ. `deleteMany` giới hạn theo
   `userId` nên không ai gỡ được reaction của người khác bằng đường này. **Thêm** reaction bằng
   emoji đã xóa vẫn bị chặn.
3. **`MessageReactionDto` thêm trường tùy chọn `emojiName`** cho token `c:<id>` khi hàng
   `CustomEmoji` còn tồn tại (còn sống hay đã xóa). `reactionMap` chỉ truy vấn thêm một lần theo
   khóa chính khi trang tin có reaction custom. Trường này thêm mới và tùy chọn nên client cũ bỏ
   qua được (quy tắc 13); không đổi payload sự kiện realtime.
4. **Hiển thị:** pill resolve được qua cache server thì hiện ảnh; không thì chip `:ten:` nếu có
   `emojiName`; không có tên thì biểu tượng chung kèm nhãn "emoji đã xóa". Id và UUID không bao giờ
   hiện ra giao diện. Client giữ `emojiName` khi sự kiện realtime đổi số đếm
   (`applyReaction`), vì sự kiện không mang tên.
5. **Không vô hiệu hóa pill của emoji đã xóa khi bấm để thêm.** Người dùng nhận thông báo
   `REACTION_EMOJI_INVALID` hiện có. Cách này tránh phải biết chắc emoji đã xóa hay chỉ chưa tải xong
   danh sách emoji của server.

## Alternatives rejected

- **Xóa dây chuyền reaction khi xóa emoji:** mất dữ liệu người dùng, cần xử lý event realtime và đếm
  lại, và không có cơ sở từ tài liệu Discord.
- **Giữ nguyên `c:<id>` trên pill:** lộ id, không có nghĩa với người dùng.
- **Nhét tên vào token reaction (`c:<id>:<name>`):** đổi định dạng lưu trữ, cần migration, và token
  thành không ổn định khi đổi tên emoji.

## Consequences

- Reaction mồ côi vẫn chiếm slot trong giới hạn 20 loại cho tới khi mọi người đã thả đều gỡ; chưa
  có thao tác "xóa mọi reaction của một emoji" cho người có `MANAGE_MESSAGES`.
- Tên chỉ có sau khi tin được tải qua REST; pill tạo mới bằng optimistic update chưa có `emojiName`
  nhưng lúc đó emoji còn sống nên resolve qua cache.
- Đổi tên emoji không cập nhật nhãn pill đã tải cho tới lần tải tin kế tiếp; chấp nhận được vì
  emoji còn sống vẫn ưu tiên tên từ cache server.
