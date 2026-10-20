# Load test và hiệu năng

Bộ công cụ ở `tools/loadtest/` (kịch bản k6, chạy nhiều instance, lấy mẫu metrics) và
`apps/api/test/loadtest/seed.ts` (dữ liệu). Quyết định và giới hạn: ADR-0033. Báo cáo: các file
`YYYY-MM-DD-<tên>.md` trong thư mục này, theo `template.md`.

Không chạy trong CI: nặng và không ổn định trên runner dùng chung. Chạy tay khi đổi thứ nằm trên đường nóng
(gateway, query tin nhắn, pool kết nối) hoặc trước khi tag phiên bản.

## Chuẩn bị (một lần)

Cần Docker (Postgres và Redis từ `docker compose up -d`), [k6](https://k6.io) và `pnpm build`.

```bash
# 1. Dữ liệu: CSDL riêng ping_load (không đụng dữ liệu dev), 5.000 user, 50 channel, 3 triệu tin (~2 phút)
pnpm --filter api loadtest:seed
#    LT_USERS, LT_MESSAGES, LT_CHANNELS chỉnh quy mô. Ra tools/loadtest/data/{tokens,meta}.json (git bỏ qua).
```

JWT được ký sẵn (6 giờ): đăng nhập là `argon2.verify`, một phép đo CPU băm mật khẩu chứ không phải thứ ta muốn đo.

## Chạy

```bash
# 2. N instance API (cổng HTTP 4001..400N, metrics 9101..910N), dùng chung Postgres ping_load + Redis DB 2
node tools/loadtest/run-instances.mjs 3
#    Giữ terminal này; Ctrl+C để tắt. Log từng instance: tools/loadtest/data/api-<i>.log

# 3. (tùy chọn) lấy mẫu metrics server ra CSV trong lúc chạy k6
node tools/loadtest/sample-metrics.mjs fanout-3x 9101,9102,9103 3

# 4. Kịch bản (PORTS là danh sách cổng instance)
k6 run tools/loadtest/rest-history.js  -e PORTS=4001,4002,4003 -e RATE=100 -e DURATION=40s
k6 run tools/loadtest/socket-fanout.js -e PORTS=4001,4002,4003 -e LISTENERS=2000 -e SEND_RATE=100 -e DURATION=60s
k6 run tools/loadtest/reconnect-storm.js -e PORTS=4001,4002,4003 -e SOCKETS=2000 -e ROUNDS=3 -e HOLD_S=15

# 5. Tóm tắt một lần chạy (thêm --summary-export=<file>.json vào lệnh k6)
node tools/loadtest/summarize.mjs tools/loadtest/data/<file>.json

# 6. EXPLAIN ANALYZE các query nóng trên dữ liệu thật
HOT=$(node -p "require('./tools/loadtest/data/meta.json').hotChannelId")
COLD=$(node -p "require('./tools/loadtest/data/meta.json').channels.at(-1).id")
SERVER=$(node -p "require('./tools/loadtest/data/meta.json').serverId")
docker exec -i ping-postgres-1 psql -U ping -d ping_load -v hot=$HOT -v cold=$COLD -v server=$SERVER < tools/loadtest/explain.sql
```

Biến thể "restart một instance giữa tải": `node tools/loadtest/run-instances.mjs 3 --restart-after=40
--restart-index=0` rồi chạy `reconnect-storm.js` với `-e ROUNDS=0 -e HOLD_S=60 -e SOCKETS=1500`.

## Các kịch bản đo gì

| Kịch bản             | Làm gì                                                                                                                                | Chỉ số chính                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `rest-history.js`    | Mỗi vòng: trang đầu một channel (70% là channel nóng), 4 trang sâu bằng cursor, 25% có thêm trang thành viên. Có 10 giây khởi động.   | p95 từng loại request, request/giây, tỉ lệ lỗi              |
| `socket-fanout.js`   | N client nối socket và join channel; một phần gửi tin cố định qua REST, nội dung mang mốc thời gian; người gửi và nghe khác instance. | độ trễ phát tin p95 (tách cùng/khác instance), lỗi, số nhận |
| `reconnect-storm.js` | Tất cả socket đóng rồi nối lại cùng lúc (không backoff, xấu nhất); hoặc instance bị restart.                                          | thời gian khôi phục p50/p95, số lần nối thất bại            |

## Lưu ý khi đọc kết quả

- **Máy đo cũng bị đo.** k6, các instance API, Postgres và Redis cùng chạy trên một máy thì tranh nhau CPU;
  ghi cấu hình máy vào báo cáo và đừng so con số giữa các máy khác nhau.
- Không có cờ tắt rate limit trong code. Các instance chạy `TRUST_PROXY=1` và mỗi người dùng ảo gửi
  `X-Forwarded-For` riêng, nên rate limit theo IP không chặn phép đo.
- Một lần chạy là một mẫu. Muốn kết luận thì chạy lại và so sánh.
