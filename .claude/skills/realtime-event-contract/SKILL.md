---
name: realtime-event-contract
description: Thêm hoặc sửa sự kiện Socket.IO, payload, room, outbox hoặc consumer Ping
---

Đọc packages/shared/src/events.ts, API conventions, gateway/service và ADR realtime hiện có.
Shared là nguồn type/schema duy nhất. REST lưu Postgres trước khi phát; socket không là log bền.

Checklist: tên event và payload tối thiểu; room/người nhận theo quyền; thay đổi cache ở hooks
feature, biến đổi cache thuần có test; multi-instance; người gửi không thấy trùng do optimistic
nonce; reconnect bù thiếu qua REST. Consumer mới phải idempotent, có lag/retry và chính sách Redis lỗi.
Kiểm thu hồi quyền, rời/kick, đổi role và payload không tới người ngoài.

Đúng: gửi message.created đã lưu tới room có kiểm quyền. Sai: dùng socket ack thay cho transaction
hoặc tuyên bố exactly-once vì client đã nhận event. Không log nội dung tin, token hay prompt.
