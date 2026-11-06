# Kịch bản demo 5 phút

Trạng thái: hoàn thiện tại T7.4 (2026-11-01), sau **2 lần diễn tập** trên laptop dev
(Windows, Postgres/Redis chạy Docker local). Mọi con số dưới đây là đo trên máy này, không phải
ước lượng; môi trường và giới hạn ghi ở [§6](#6-điều-chưa-diễn-tập-được).

Mục tiêu: người xem hiểu trong 5 phút rằng đây là **sản phẩm chat chạy thật**, và ba chỗ khó
(không mất/không lặp tin, quyền không rò rỉ, LLM là dependency không tin cậy) đã được xử lý —
không phải danh sách tính năng.

## 1. Chuẩn bị (làm trước, không tính vào 5 phút)

### 1.1. Dữ liệu sạch trên một DB riêng

Không demo trên DB dev đã tích nhiều server từ các lần seed/test: mỗi server cũ sinh một request
`/servers/:id/unread`, vượt hạn mức **100 request/phút/IP** (global throttler) và trang quay
6,6 giây vì 429 (đo ở lần diễn tập 1). Dùng DB riêng `ping_demo`, seed lại từ đầu bằng một lệnh:

```bash
pnpm demo:prepare          # bật Docker, tạo ping_demo nếu chưa có, migrate + seed
pnpm demo:prepare --fresh  # buổi quay cần sạch tuyệt đối: xoá rồi tạo lại ping_demo
```

Script (`scripts/prepare-demo.mjs`) còn kiểm số liệu seed, cảnh báo nếu DB có dư dữ liệu và cảnh
báo khi cổng 3000/4000 đang bận (process cũ có thể trỏ DB khác — sự cố lần diễn tập 1).

Làm tay khi cần (đúng phần việc script thực hiện):

```bash
docker exec ping-postgres-1 createdb -U ping ping_demo    # chỉ lần đầu
cd apps/api
DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_demo" pnpm exec prisma migrate deploy
cd ../..
DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_demo" pnpm seed:demo
```

Kỳ vọng in ra: `seed-demo: servers=3 channels=9 messages=21600 mentions=360`; 4 tài khoản
`alice/bob/carol/david@ping.dev`, mật khẩu `password123`. Seed lặp lại cho cùng trạng thái (id cố
định, không dùng `Date.now`), nên chạy lại trước mỗi buổi demo là đủ.

### 1.2. Ba process, đúng DB

```bash
export DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_demo"
pnpm --filter api dev            # API :4000
pnpm --filter api dev:worker     # worker quét tệp — thiếu process này tệp đứng ở "Đang kiểm tra tệp…"
pnpm --filter web dev            # web :3000
```

`dev:worker` chạy bằng `nest start --entryFile worker` (tsc), **không phải** `tsx`: tsx/esbuild
không phát `emitDecoratorMetadata` nên Nest không resolve được dependency (lỗi
`UndefinedDependencyException`). Đây là lỗi thật phát hiện khi diễn tập, đã sửa trong
`apps/api/package.json`.

Kiểm tra nhanh trước khi bấm giờ:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/v1/health   # 200
docker exec ping-postgres-1 psql -U ping -d ping_demo -c 'select count(*) from "Server"'  # 3
```

Nếu API đang trỏ nhầm DB (ví dụ process cũ còn sống ở cổng 4000 trỏ `ping_visual`), mọi thứ
_trông_ bình thường nhưng tệp không bao giờ `ready` và tin gửi vào DB khác — đây chính là sự cố
gặp ở lần diễn tập 1. Kiểm bằng `select count(*) from "Server"` ở DB API đang dùng, hoặc đọc log
khởi động.

### 1.3. Cửa sổ và tài khoản

- Trình duyệt ở **1280×800**, zoom 100%, **một tab chính** đăng nhập `alice@ping.dev`.
- Tab/hồ sơ thứ hai (cửa sổ ẩn danh) đăng nhập `bob@ping.dev` — dùng cho nhịp realtime.
- Sẵn một tài khoản **ngoài server** (`eve@ping.dev`, tự đăng ký) cho nhịp quyền.
- Mailpit mở ở <http://127.0.0.1:8025> nếu muốn chỉ luôn cảnh "Email chưa xác minh".
- Chạy `pnpm --filter web build` rồi `start` nếu buổi demo cần ghi hình: chế độ dev hiện badge
  Next.js DevTools ("1 Issue") ở góc dưới phải.

## 2. Kịch bản

Bấm giờ ở 0:00 khi trang `/login` đã mở sẵn, ô email đã focus.

| Mốc       | Màn hình                 | Làm                                                                                                             | Nói (gợi ý, ~1 câu)                                                                                                                        |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:25 | `/login` → kênh đầu tiên | Đăng nhập alice. Vào `Ping Dev Team › #general`.                                                                | "Chat tự dựng: server, kênh, vai trò, tin nhắn realtime. Đăng nhập xong vào thẳng kênh trong ~1 giây."                                     |
| 0:25–1:20 | `#general`               | Gõ tin ở alice; ở cửa sổ bob thấy tin hiện ngay; bob trả lời (reply) tin đó; alice thả reaction.                | "Tin đi qua Socket.IO; reply giữ ngữ cảnh, reaction cập nhật cả hai bên."                                                                  |
| 1:20–1:55 | Hộp tìm kiếm             | `Ctrl/⌘+K` hoặc nút kính lúp → gõ "họp" → lọc theo người/kênh/thời gian → bấm một kết quả để nhảy.              | "Tìm trong server, có bộ lọc; kết quả chỉ gồm kênh người này được xem."                                                                    |
| 1:55–2:35 | Composer                 | Đính kèm một ảnh → chờ nhãn chuyển "Đang kiểm tra tệp…" → "Sẵn sàng gửi" → gửi kèm câu.                         | "Tệp do worker kiểm: quét xong mới cho gửi; URL tệp có chữ ký, hạn 24 giờ và mỗi lần tải vẫn kiểm quyền."                                  |
| 2:35–3:15 | Nút "Hỏi"                | Mở ngăn kéo hỏi AI, hỏi một câu về kênh.                                                                        | "AI chỉ được trả lời kèm trích dẫn tin có thật; không có trích dẫn hợp lệ thì **không phát** câu trả lời — đây là câu trả lời bị từ chối." |
| 3:15–3:50 | Tab ngoài / API          | carol (thành viên) mở nhật ký hành động → 403; eve (ngoài server) mở kênh → 403; eve mở URL DM alice↔bob → 404. | "Thành viên thiếu quyền nhận 403; người ngoài không thấy kênh/DM tồn tại — 404, và không lộ nội dung."                                     |
| 3:50–4:30 | Cài đặt server           | `Ping Dev Team › Cài đặt`: vai trò, mã mời, danh mục kênh; sửa chủ đề kênh.                                     | "Quản trị ngay trong sản phẩm: vai trò theo quyền, mã mời tái tạo, danh mục kéo–thả."                                                      |
| 4:30–5:00 | Cài đặt cá nhân          | Đổi theme Sáng/Tối, đổi ngôn ngữ vi→en→vi; quay lại kênh.                                                       | "Hai ngôn ngữ, hai theme, đồng bộ theo tài khoản; đổi là áp dụng ngay."                                                                    |

Câu chốt (5 giây cuối): "Chạy thật trên Postgres/Redis thật, CI có 6 check bắt buộc; chưa có bản
công khai và chưa đo RPO/RTO — những ô đó tôi để 'chưa đo' thay vì điền số ước lượng."

## 3. Số đo app-side (dùng khi bị hỏi "nhanh không?")

Đo trong 2 lần diễn tập, DB demo sạch, laptop dev, một process API + một worker:

| Thao tác                               | Số đo                                                                    | Nguồn                           |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| Đăng nhập → kênh có tin                | 1.099 ms (lần 1); API `POST /auth/login` 1.141 ms, `GET /servers` 612 ms | DevTools + log API              |
| Gửi tin → bong bóng hiện               | 87 ms (lần 1), 313 ms (lần 2); `POST …/messages` phía server 1.486 ms    | DevTools + log API              |
| Mở tìm kiếm → có kết quả đầu           | hộp 386 ms; kết quả 1.273 ms (gồm debounce 300 ms); lần trước 373/741 ms | DevTools                        |
| Mở "Hỏi AI" → câu trả lời bị từ chối   | ngăn kéo 394 ms; lỗi hiện sau 2.017 ms                                   | DevTools                        |
| Tệp: tạo → upload → complete → `ready` | 612 + 1.098 + 508 ms; `ready` sau **2,8 s** (worker tick 1 s)            | script đo qua API               |
| DM của người khác                      | 404 trong 603 ms (thành viên khác đọc DM: 404, không phải 403)           | script đo qua API               |
| Đổi theme / đổi ngôn ngữ               | 129 ms / 202 ms                                                          | DevTools (`data-theme`, `lang`) |
| Trang Cài đặt server                   | 6 request song song, mỗi request 237–822 ms, tổng ~0,9 s                 | log API                         |

## 4. Dự phòng

| Sự cố                               | Dấu hiệu                                                       | Xử lý ngay trên sân khấu                                                                                             |
| ----------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| AI không có key / Qdrant chết       | ngăn kéo báo "AI tạm không khả dụng" (`AI_UNAVAILABLE`)        | Nói thẳng "AI là tính năng tuỳ chọn, thiếu dependency thì tắt hẳn chứ không bịa"; bỏ qua nhịp AI, không cần sửa gì.  |
| AI trả lời không trích dẫn          | "Câu trả lời không có trích dẫn hợp lệ, nên bị từ chối."       | Đây là **hành vi đúng** — dùng luôn làm điểm nhấn của nhịp 2:35.                                                     |
| Worker chưa chạy                    | tệp đứng ở "Đang kiểm tra tệp…" mãi                            | Bỏ tệp khỏi composer, chuyển sang nhịp tìm kiếm; khởi động `pnpm --filter api dev:worker` khi người xem không chú ý. |
| DB bẩn / quá nhiều server           | trang quay, 429 trong Console ở `/servers/:id/unread`          | Không bấm F5 liên tục; đợi 60 giây cho cửa sổ hạn mức trôi, hoặc chuyển sang kịch bản đã seed sẵn DB riêng.          |
| Mất mạng / Redis chết giữa demo     | banner `ConnectionBanner` hiện "Mất kết nối", tin vẫn gửi được | Chỉ vào banner: client phát hiện khoảng trống khi reconnect và tải bù — không mất tin, không lặp.                    |
| Cửa sổ thứ hai không đăng nhập được | phiên cũ hết hạn                                               | Dùng API/`curl` gửi tin thay cho bob (đã làm khi diễn tập) — người xem vẫn thấy realtime ở cửa sổ alice.             |

## 5. Không demo (và nói thẳng nếu bị hỏi)

- Không có bản chạy công khai/staging; demo chạy local ([ADR-0059](../adr/0059-defer-paid-infrastructure.md)).
- Không load test ngoài laptop; con số 500 socket là T0.6 trên một máy.
- Chưa quét virus tệp; chưa có RPO/RTO đo thật; backup mới diễn tập local.
- Không demo gọi video/voice, E2E encryption, mobile native — ngoài phạm vi v0.2.0.

## 6. Điều chưa diễn tập được

- **Chưa ghi hình**: chưa có file video; kịch bản này để người khác tự diễn.
- **Một tab**: môi trường tự động chỉ có một trang nên nhịp realtime hai người được kiểm bằng API
  (`POST /messages` của bob) chứ không phải hai cửa sổ thật.
- **Viewport 792×704** trong lần đo (cửa sổ automation), không phải 1280×800 như kịch bản; layout
  rộng đã được phủ bởi baseline visual TF.13 (1280×800, 768, 375).
- Hai lần diễn tập đều trên **cùng một laptop**, không có người xem thật; thời lượng 5 phút là
  kịch bản, chưa được bấm giờ trước khán giả.

## 7. Checklist 60 giây trước khi bấm giờ

1. `curl /health` = 200 và `select count(*) from "Server"` = 3 trên DB API đang dùng.
2. Worker đang chạy (log có `worker started (outbox relay)`).
3. alice đã đăng nhập ở tab chính; bob đăng nhập ở cửa sổ ẩn danh; eve có sẵn để dùng.
4. Đang ở `/login` (chưa đăng nhập) hoặc ở `#general` tuỳ nhịp bắt đầu; theme Tối, ngôn ngữ Tiếng Việt.
5. Tắt thông báo hệ điều hành; zoom 100%; ẩn thanh bookmark.
