# ADR-0039: Gộp (batch) presence và giới hạn phạm vi đăng ký

Status: proposed — chờ OWNER duyệt
Date: 2026-10-22

## Context

Hiện tại mỗi lần socket kết nối/ngắt, server phát `PresenceUpdated` ngay lập tức tới mọi server mà user
tham gia (truy vấn `member.findMany` + emit theo room). Ở tải pilot (300–500 socket) và case reconnect
storm, điều này tạo hàng triệu event/90s và tăng tải DB/Redis.

## Decision

1. Server gộp các thay đổi presence theo từng `serverId` trong cửa sổ **1 giây** (có thể cấu hình qua
   `PRESENCE_BATCH_MS`, mặc định 1000, min 100, max 5000) rồi phát một lượt `PresenceUpdated` cho mỗi
   (userId, status) đang chờ.
2. Truy vấn membership vẫn best-effort; nếu pool cạn, presence bị bỏ qua (không sập tiến trình) như hiện tại.
3. Client chỉ đăng ký presence cho thành viên đang hiển thị (danh sách thành viên mở) — xử lý ở frontend
   (TF/Pha 3), không nằm trong ADR này.
4. Giữ nguyên tên event `PresenceUpdated` và payload `{ userId, status }` để tương thích client.

## Alternatives

- Giữ phát ngay: đơn giản nhưng không giảm tải.
- Gộp thành một event `PresenceBatch` mới: giảm thêm overhead nhưng phá tương thích client và cần migration.

## Consequences

- Độ trễ presence tối đa ~1s (chấp nhận được cho pilot).
- Test e2e presence phải cho phép độ trễ nhỏ (poll/wait).
- Cần đo before/after (số event/90s) trên profile pilot; lưu baseline trong evidence T1.2.
