# T7.4 — Kịch bản demo 5 phút, seed sạch, diễn tập 2 lần

Ngày: 2026-11-01. Mục tiêu theo kế hoạch: `demo.md` + dữ liệu seed sạch + bản dự phòng khi
mạng/LLM lỗi, **diễn tập được 2 lần, ghi thời gian**.

## Đã giao

- [`docs/v0.2.0/demo.md`](../../demo.md): kịch bản 8 nhịp trong 5:00, chuẩn bị môi trường, số đo
  app-side, bảng dự phòng, checklist 60 giây, mục "không demo".
- Quy trình **seed sạch trên DB riêng** (`ping_demo`): tạo DB → `prisma migrate deploy` →
  `pnpm seed:demo`, chạy lại lặp lại được (seed dùng id cố định, không `Date.now`).
- Hai lần diễn tập thật trong trình duyệt, có ghi thời gian (dưới đây).

## Diễn tập 1 — phát hiện môi trường hỏng

Chạy trên DB dev `ping` (đã tích 26 server từ các lần seed/test trước). Kết quả:

| Hiện tượng                                                                                                                  | Nguyên nhân thật                                                                                                                                           | Xử lý                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api dev:worker` chết khi khởi động: `UndefinedDependencyException … AccountService (?, +, MAILER) index [0]` | `tsx`/esbuild không phát `emitDecoratorMetadata`; Nest không thấy type của constructor                                                                     | Đổi script sang `nest start --watch --entryFile worker` (tsc) và kiểm log `worker started (outbox relay)` |
| Tệp đứng ở "Đang kiểm tra tệp…" vô hạn, mọi lần tải lại chỉ thấy `GET /uploads/:id` 200                                     | API đang chạy là process cũ (PID 9996, từ lần test visual) trỏ DB `ping_visual`, còn tôi đang seed/kiểm ở DB `ping` → id tệp không tồn tại ở DB mà API đọc | Kill process cũ, khởi động API đúng `.env`; sau đó thêm bước kiểm "DB nào" vào chuẩn bị                   |
| Console đầy `429 Too Many Requests` ở `/servers/:id/unread`, trang Cài đặt server quay **6.642 ms**                         | DB bẩn: 26 server ⇒ 26 request unread mỗi lần vào trang, vượt throttler 100 request/phút/IP                                                                | Chuyển sang DB demo sạch riêng (3 server)                                                                 |
| Console có `Warning: [antd: Alert] message is deprecated. Please use title instead.`                                        | `PingAlert` được truyền `message` ở 2 chỗ                                                                                                                  | Đổi sang `title` (`ask-drawer.tsx`, `app/dev/ui/page.tsx`)                                                |

Nhịp đã kiểm ở lần 1 (DB `ping`): đăng nhập → kênh 1.099 ms; gửi tin → hiện 87 ms; mở tìm kiếm
373 ms, kết quả đầu 741 ms; DM của người khác → 404.

## Diễn tập 2 — sau khi sửa, DB sạch

DB `ping_demo` mới: `migrate deploy` 27 bảng, `seed:demo` in đúng
`servers=3 channels=9 messages=21600 mentions=360`, 4 user. API + worker cùng trỏ `ping_demo`.

| Nhịp             | Đo được                                                                                                                        | Ghi chú                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Đăng nhập → kênh | `POST /auth/login` 1.141 ms, `GET /servers` 612 ms; 0 lần 429 trong 112 request                                                | Không còn 429 so với lần 1                                                                  |
| Gửi tin          | bong bóng hiện 313 ms (lần 1: 87 ms); `POST /messages` phía server 1.486 ms                                                    | Bong bóng là optimistic, server xác nhận sau                                                |
| Tìm kiếm         | hộp mở 386 ms, kết quả đầu 1.273 ms với "họp"                                                                                  | Gồm debounce 300 ms                                                                         |
| Tệp              | tạo 612 ms + upload 1.098 ms + complete 508 ms → `ready` sau **2.816 ms**                                                      | Worker tick 1 s; đo qua API, không qua UI                                                   |
| Hỏi AI           | ngăn kéo 394 ms; câu trả lời bị từ chối hiện sau 2.017 ms                                                                      | Server trả `AI_NO_CITATION` (Qdrant có 8 chunk, guard từ chối vì không có trích dẫn hợp lệ) |
| Quyền            | carol (thành viên) nhật ký hành động → **403**; eve (ngoài server) kênh → **403**; eve đọc DM alice↔bob → **404** trong 603 ms | Đúng ADR-0028, xem "lỗi tài liệu" bên dưới                                                  |
| Cài đặt server   | 6 request song song 237–822 ms, tổng ~0,9 s                                                                                    | `users/me`, `me/permissions`, `roles`, `audit-log`, `members`, `emojis/stickers`            |
| Theme / ngôn ngữ | `data-theme` đổi sau 129 ms; `lang` vi→en sau 202 ms, toàn bộ chuỗi đổi                                                        | Đổi lại về vi sau khi đo                                                                    |

## Lỗi tài liệu bắt được trong lúc diễn tập

- **README gốc (T7.3) viết "người ngoài nhận 404 chứ không phải 403"** — sai so với hành vi đo
  được và so với [ADR-0028](../../../adr/0028-api-conventions.md): server lạ luôn 403, id không
  tồn tại hoặc DM của người khác mới 404. Đã sửa README thành mô tả đúng cả hai nhánh.
- Kịch bản dựa trên giả định "carol là người ngoài": seed-demo thêm **cả 4 user vào cả 3 server**,
  nên phải có tài khoản đăng ký mới (`eve`) mới kiểm được nhánh 404. Điều này đã ghi vào `demo.md`.

## Kiểm chứng

| Việc                      | Cách kiểm                                                                              | Kết quả                                          |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Seed sạch                 | `prisma migrate deploy` + `pnpm seed:demo` trên `ping_demo`                            | 27 bảng; 3 server / 9 kênh / 21.600 tin / 4 user |
| Không còn 429 khi DB sạch | đếm log API                                                                            | 0/112 request là 429 (DB bẩn: nhiều 429)         |
| Tệp đi hết pipeline       | script gọi `POST /uploads` → `PUT content` → `POST complete` → poll `GET /uploads/:id` | `ready` sau 2,8 s, không lỗi                     |
| Worker cần process riêng  | chạy API mà không chạy worker                                                          | tệp đứng ở `queued`; chạy worker → `ready`       |
| DM riêng tư               | carol gọi `GET /channels/<dm>/messages`                                                | 404 `NOT_FOUND`                                  |
| Ngoài server              | `eve` gọi `GET /channels/<kênh server>/messages`                                       | 403 `FORBIDDEN` "not a member" (đúng ADR-0028)   |
| Theme / ngôn ngữ          | đổi trong `/settings/appearance`, `/settings/language`                                 | 129 ms / 202 ms, đổi lại được                    |
| Tài liệu                  | `pnpm docs:check`, `prettier --check`                                                  | sạch                                             |

## Giới hạn

- **Không có bản ghi hình**; kịch bản chưa được bấm giờ trước người xem thật.
- Nhịp realtime hai người được kiểm bằng **một tab + gọi API** (môi trường automation chỉ có một
  trang), không phải hai cửa sổ như kịch bản yêu cầu.
- Viewport lúc đo 792×704 (cửa sổ automation), không phải 1280×800; layout rộng do TF.13 phủ.
- Số đo là một laptop, một process API, không tải nền; dao động giữa hai lần (87 vs 313 ms) cho
  thấy đây là số tham khảo, không phải benchmark.
- DB `ping_demo` giữ lại trên máy dev sau khi đo; không nằm trong repo, không có dữ liệu thật.

## Lệnh chạy lại

```bash
DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_demo" pnpm --filter api seed:demo
export DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_demo"
pnpm --filter api dev & pnpm --filter api dev:worker & pnpm --filter web dev
# số đo tệp lấy từ một script gọi API dùng một lần (không commit); UI chỉ hiện nhãn
# "Đang kiểm tra tệp…" → "Sẵn sàng gửi" sau khi worker xử lý xong.
```
