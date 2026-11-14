# Dữ liệu demo trên production

Server **Ping Demo** được tạo trên bản thật bằng tài khoản riêng `owner-demo@ping.dev`, hoàn toàn qua
API công khai ([`scripts/seed-prod-demo.mjs`](../../scripts/seed-prod-demo.mjs) — không ghi thẳng DB).
Không đụng tới server hay tài khoản thật đang có trên production.

## Chạy lại (idempotent)

Thông tin đăng nhập nằm trong `.env.demo` ở gốc repo (đã gitignore, không commit):

```bash
node scripts/seed-prod-demo.mjs
```

Script đăng nhập lại các tài khoản đã có, tạo server/kênh nếu thiếu, gửi tin nhắn theo nonce cố định
và bỏ qua tin đã gửi, nên chạy nhiều lần cho ra đúng một bộ dữ liệu. Lần chạy thứ ba in
`0 mới, 40 có sẵn`; tài khoản mới được đăng ký cách nhau 13 giây để không chạm `authRegister 5/phút`.
Script không in mật khẩu.

## Nội dung đã tạo

| Thứ                                    | Số lượng |
| -------------------------------------- | -------- |
| Kênh `general`, `random`, `dev`        | 3        |
| Tin nhắn tiếng Việt (có chuỗi trả lời) | 40       |
| Reaction                               | 6        |
| Tin ghim (kênh `general`)              | 1        |
| DM demo1 → demo2                       | 1        |

Server id `01a1d82d-3653-7766-9cf0-ea31e55c0092`, DM id `01a1d82e-abbd-706b-8454-0246dfb9d63b`.

## Quyền của demo1 (đã kiểm bằng trình duyệt, 2026-11-14)

Đăng nhập `demo1@ping.dev` trên https://20.193.75.48 và mở `#general`:

- Thấy server, đọc và gửi tin nhắn bình thường.
- `GET /api/v1/servers/<id>/audit-log` trả **403** (script seed tự khẳng định).
- Mở `/servers/<id>/settings`: hiện "Bạn không có quyền quản trị server này.", không có mục "Vai trò"
  — nhóm quyền "Quản trị" không xuất hiện.
- **Hỏi AI**: mở được, gửi câu hỏi nhưng báo "AI hiện không sẵn sàng. Vui lòng thử lại sau." —
  production chưa cấu hình `GROQ_API_KEY` (SSE trả `AI_UNAVAILABLE`).
- **Tab GIF**: mở được từ hộp sticker nhưng báo "Tính năng GIF tạm thời chưa khả dụng. Thử lại sau nhé."
  — API `GET /api/v1/gifs/trending` trả **503** vì production chưa cấu hình khóa Tenor.

Ảnh chụp: [`docs/v0.2.0/evidence/V2-final/screens/`](../v0.2.0/evidence/V2-final/screens/)
(`demo1-server-1280.png`, `demo1-ask-ai-1280.png`, `demo1-gif-1280.png`, `demo1-settings-1280.png`).

Khi mở `/login` trong trình duyệt chưa có phiên, app gọi `POST /api/v1/auth/refresh` và nhận **401** —
phản hồi mong đợi của lần đăng nhập đầu, không phải lỗi.
