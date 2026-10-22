---
name: idor-test
description: Thêm hoặc sửa endpoint/query có ID tài nguyên Ping; kiểm truy cập chéo user/server/channel
---

Đọc apps/api/test/idor.e2e-spec.ts, guard/ability/service của route và shared permissions.
Thêm route vào ID_ROUTES cùng dòng tấn công; test quét controller phải tiếp tục bắt route thiếu.

Checklist: ít nhất hai user/hai server, thành viên hợp lệ, người ngoài, user vừa bị kick/thu hồi
quyền; thử ID server/channel/message của bên khác ở path/query/body theo route thật. Ghi expected
status/error code theo API conventions và kiểm không lộ nội dung. List phải ràng buộc tenant ở where.
Không thay CASL bằng check role rải rác; UI ẩn nút không chứng minh backend an toàn.

Đúng: Alice gọi ID message của server Bob và bị từ chối. Sai: chỉ thử UUID không tồn tại hoặc
mock guard luôn cho qua rồi kết luận IDOR đạt. Chạy e2e thật với DB/Redis, lưu log không secret.
