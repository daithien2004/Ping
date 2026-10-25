# Evidence `TG.0` — `Kiểm kê tính năng bằng code, cập nhật ma trận 1.5, ADR-0056`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kết quả kiểm kê + ADR-0056 trong phiên.
- Task, nhánh: TG.0 — `docs/tg0-inventory` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base = main sau Pha 4.
- Commit: docs-only (ADR-0056 + evidence + status).

## Kết quả kiểm kê (ma trận 1.5 cập nhật trong kế hoạch local)

Kiểm tra lại từng dòng bằng code trên main sau Pha 4 — không tin mô tả:

| Dòng ma trận                             | Kết luận kiểm kê    | Bằng chứng code                                                                                                 |
| ---------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Đăng ký/đăng nhập/refresh/lockout        | ✅ giữ (verify lại) | `auth.controller.ts` (register/login/refresh/logout), `login-attempts.service.ts` (5 lần sai/(email,IP) → khóa) |
| Xác minh email, quên/đổi mật khẩu, phiên | ❌ (TG.8, chưa làm) | users controller chỉ có `GET me`; không có endpoint password/sessions                                           |
| Hồ sơ: tên hiển thị, avatar              | ◐                   | `User.avatarUrl` trong model + hiển thị chữ cái; chưa có `PATCH /users/me`                                      |
| Server: quản trị/audit/invite            | ✅ (nâng từ ◐)      | Pha 3: TF.10 + T3.1–T3.7 (vai trò, kick, audit, invite regenerate có hạn dùng)                                  |
| Server: icon, nickname                   | ◐                   | `Member.nickname` trong model/DTO; chưa PATCH, chưa icon server                                                 |
| Channel: text CRUD                       | ✅ giữ              | T3.2 (tạo/đổi tên/xóa + realtime)                                                                               |
| Tin nhắn: gửi/sửa/xóa/typing/optimistic  | ✅ giữ              | messages module + `typing.started` trong events                                                                 |
| Unread, mention                          | ✅ (nâng từ ❌)     | T4.1–T4.3: `ChannelReadState`/`MessageMention`, `PUT read`, `GET unread`, badge + vạch tin mới                  |
| Tìm kiếm FTS                             | ◐                   | T4.6: FTS + trigram + `SearchDialog`; hybrid vector T5.5 chưa                                                   |
| Permalink `?m=`                          | ◐                   | cơ chế focusId + highlight dùng bởi search/AI; còn thiếu Copy link + `?around=`                                 |
| Reply/reaction/ghim/markdown/đính kèm    | ❌ (TG.1–TG.6)      | schema không có `replyToId`/reaction/`pinnedAt`; chưa có module upload                                          |
| Emoji/sticker/GIF                        | ❌ (TG.22–TG.25)    | chưa có module expressions                                                                                      |
| DM/bạn bè/thông báo/cài đặt              | ❌ (TG.9/15/12/13)  | chưa có module/block/notification-pref/UserSettings                                                             |
| AI hỏi đáp RAG                           | ◐                   | T5.1–T5.7: ask SSE + trích dẫn + quota/budget/cache/metrics; còn T5.5 hybrid, T5.8 tóm tắt, T5.9 đánh giá       |
| Voice channel                            | Ngoài (ADR-0056)    | —                                                                                                               |

Ma trận đầy đủ (43 dòng, có cột "Hiện tại") cập nhật trong `docs/ping-v0.2.0-plan.md` mục 1.5
(file local theo yêu cầu OWNER, không commit).

## ADR-0056

[ADR-0056](../../../adr/0056-no-voice-video.md) — không làm voice/video trong v0.2.0: TURN/băng
thông không vừa ngân sách 0 USD; độ phức tạp không chồng lấn kỹ thuật cốt lõi; giá trị Pha G
nằm ở text; kiến trúc không cản trở tương lai (room Socket.IO tái dùng được làm signaling).
TG.21 giữ [X], chỉ cân nhắc khi mọi [M] xong sớm.

## Thứ tự Pha G chốt lại (theo lịch 8 tuần, mục 6.2)

Tuần 3 (đang ở đây): **TG.4 (markdown + emoji), TG.23 (emoji picker)** — hai task khung render
tin nhắn, mọi task sau phụ thuộc. Tiếp: TG.1 reply → TG.5 permalink → TG.2 reaction → TG.3 ghim
(Tuần 4); TG.6 upload → TG.7 hồ sơ → TG.22 sticker → TG.24 emoji tùy chỉnh → TG.25 GIF (Tuần 5);
TG.9 DM → TG.12 thông báo → TG.13 cài đặt → TG.8 vòng đời tài khoản → TG.11 ban → TG.10 category
(Tuần 6). Không đổi gì so với lịch đã chọn — kiểm kê xác nhận các giả định lịch vẫn đúng.

## Giới hạn

- Kiểm kê là ảnh chụp trên `d056c55`; các task [S] chỉ đánh giá qua schema/model, chưa đi sâu.
- Ma trận 1.5 nằm trong file local (giữ theo yêu cầu OWNER) — bảng rút gọn ở đây là bằng chứng
  commit được.
