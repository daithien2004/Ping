# ADR-0043: Trạng thái đã đọc và mention (tầng dữ liệu)

Status: accepted — OWNER duyệt kèm kế hoạch T4.1 trong phiên ngày 2026-10-24
Date: 2026-10-24

## Context

Pha 4 cần unread/mention (badge server/channel, vạch "tin mới", đếm mention). Trước phiên này
không có trạng thái đã đọc theo kênh và không ghi lại mention nào: client không thể biết mình
đã đọc đến đâu và ai vừa được nhắc. T4.1 chỉ dựng tầng dữ liệu (migration + parse); endpoint
đọc/ghi (`PUT /channels/:id/read`, `GET /servers/:id/unread`) là T4.2, UI badge là T4.3.

## Decision

1. **Trạng thái đã đọc** nằm trong bảng `ChannelReadState` — một hàng cho mỗi
   (member, channel): `lastReadMessageId` (nullable) + `updatedAt`. Postgres là nguồn sự thật
   (quy tắc 2), đồng bộ nhiều tab qua event `read.updated` (T4.2).
2. **Đếm unread bằng DB có trần**, không thêm bộ đếm Redis: `count` trên khoảng
   `id > lastReadMessageId` với index `(channelId, id DESC)` sẵn có, `LIMIT 101` → hiển thị
   `99+` khi vượt. Chỉ đo thấy cần mới thêm bộ đếm (ghi lại ở lượt đo T4.2/T6.1).
3. **Mention do server parse khi tạo/sửa tin** — client không tự khai báo danh sách mention
   (nếu để client khai báo, bot/người dùng có thể ping tùy tiện). Token hợp lệ: `@` đứng sau
   ranh giới từ (không phải `a@b` của email), theo sau là chuỗi `[A-Za-z0-9_.-]{3,32}` đúng
   charset username. Tối đa `MENTIONS_PER_MESSAGE = 20` mention khác nhau mỗi tin — phần vượt
   bị bỏ qua, tin vẫn gửi bình thường.
4. **Giải nghĩa token** (theo thứ tự): `@everyone` → kind `everyone`; trùng username của
   **thành viên server** → kind `user` (user tồn tại nhưng không thuộc server thì không tính);
   trùng tên role của server (role không phải `@everyone` mặc định) → kind `role`. Tên role có
   khoảng trắng không nhắc được — token không chứa khoảng trắng; chấp nhận vì role hệ thống
   đặt tên một từ. So khớp username/role phân biệt hoa thường.
5. **Bit quyền `MENTION_EVERYONE` (512n)** chặn cả `@everyone` lẫn `@role`: người gửi không có
   bit (owner/ADMINISTRATOR ngầm có) thì hai loại mention này **không được ghi** — tin vẫn gửi
   như văn bản thường (không chặn đường gửi, đúng tinh thần Discord). `@user` luôn được ghi.
6. `MessageMention` dùng id surrogate + ràng buộc unique `(messageId, kind, mentionedMemberId,
roleId)` thay vì PK composite như dự thảo plan 5.1: Postgres không cho cột NULL trong primary
   key. Dedup do ứng dụng kiểm soát (parse ra tập token duy nhất; sửa tin xoá rồi ghi lại toàn
   bộ trong cùng transaction).
7. Sửa tin = parse lại từ nội dung mới, **xoá toàn bộ mention cũ rồi ghi lại** trong cùng
   transaction với cập nhật tin.
8. Không đổi DTO/event trong T4.1. Cờ `mentionsMe` trên `message.created` (tính theo người
   nhận, không rò danh sách mention của người khác — plan 5.3) thuộc T4.2.

## Alternatives

- Bộ đếm unread trong Redis: đọc nhanh hơn nhưng thêm trạng thái cần đồng bộ lại sau khi Redis
  chết/restart; đếm DB có trần đủ cho pilot và không có cửa sổ sai.
- Client tự gửi danh sách mention kèm tin: đơn giản cho server nhưng mở cửa ping giả mạo.
- Từ chối tin (400) khi thiếu `MENTION_EVERYONE`: an toàn hơn về nghĩa dữ liệu nhưng làm gãy
  đường gửi tin phổ thông; Discord cũng chỉ "không ping" thay vì chặn.
- Mention ghi theo user-id từ cú pháp `@<id>`: chính xác tuyệt đối nhưng không gõ tay được.

## Consequences

- Mỗi tin tạo/sửa thêm 1–3 query tra thành viên/role theo server (theo tập token) và một
  `createMany` — nằm trong transaction sẵn có, chấp nhận được ở tải pilot; đo lại ở T6.1.
- Kick member/xoá role cascade xoá hàng mention tương ứng (đúng dọn dẹp; mention lịch sử không
  cần giữ vì unread chỉ tính khoảng tin mới).
- Role editor hiện thêm một checkbox (`MENTION_EVERYONE`) ở nhóm "Tin nhắn" — i18n vi/en.
- Bảng `ChannelReadState` rỗng cho tới khi T4.2 có endpoint ghi.
