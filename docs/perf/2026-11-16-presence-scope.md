# Báo cáo hiệu năng — Bão presence: gộp và đăng ký theo thành viên đang xem (2026-11-16)

Câu hỏi (B1/B3 trong kế hoạch scale): gộp theo cửa sổ (ADR-0039) và đăng ký theo thành viên đang xem
(ADR-0091) giảm số event presence mỗi socket nhận được bao nhiêu? Mỗi lần đo chỉ đổi **một** thứ.

## Môi trường

| Mục                     | Giá trị                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Máy                     | Laptop Intel i5-11400H 2,7 GHz, 12 luồng, 15,8 GiB RAM, Windows 11                           |
| Nơi chạy Postgres/Redis | Docker Desktop (Postgres 17.11, Redis 7.4.11), cùng máy; API dùng Redis DB 2                 |
| Số instance API         | 1 (`NODE_ENV=production`, `dist/main.js`, `TRUST_PROXY=1`, `PG_POOL_MAX` mặc định 10)        |
| Phiên bản app           | nhánh `feat/scale-b1-b3-measure`, base `2d58c08`                                             |
| Công cụ                 | k6 v1.7.1, Node v24.22.0; k6 chạy **cùng máy** với API, Postgres và Redis                    |
| Dữ liệu                 | `ping_load`: 500 user, 500 thành viên trong **một** server, 3 channel, 0 tin                 |
| Kịch bản                | `reconnect-storm.js`: 3 vòng đóng và nối lại, giữ 15 giây mỗi vòng, không backoff (xấu nhất) |

Lệnh: `SOCKETS=300 bash tools/loadtest/storm-compare.sh <nhãn> <PRESENCE_BATCH_MS> <PRESENCE_SCOPED> <WATCH>`.
Số liệu thô: [data/2026-11-16-presence-scope/](data/2026-11-16-presence-scope/).

## Kết quả (300 socket, một mẫu mỗi cấu hình)

| Cấu hình                        | `PRESENCE_BATCH_MS` | `PRESENCE_SCOPED` | `WATCH` | `presence_emitted_total` | `presence_received` (k6) | nhận mỗi socket |
| ------------------------------- | ------------------- | ----------------- | ------- | ------------------------ | ------------------------ | --------------- |
| A: trước batching               | 0                   | false             | 0       | 2.400                    | 486.644                  | ~1.622          |
| B: batching (ADR-0039)          | 1000                | false             | 0       | 1.494                    | 377.073                  | ~1.257          |
| C: batching + scoped (ADR-0091) | 1000                | true              | 50      | 1.496                    | 32.071                   | ~107            |

So sánh:

- **Batching (A → B):** số lệnh phát giảm 37,8% (2.400 → 1.494) và số event nhận giảm 22,5%. Đúng kỳ vọng
  của case study 1: batching chỉ gộp các lần đổi trạng thái lặp lại của cùng một user, **không** giảm
  số người nhận mỗi lần phát.
- **Scoped (B → C):** số event nhận giảm **91,5%** (377.073 → 32.071); so với trước batching (A → C) giảm 93,4%.
  Số lệnh phát gần như không đổi (1.494 so với 1.496) vì ở profile này mọi user chỉ ở một server; người
  nhận mới là thứ giảm. Khi user ở nhiều server, scoped phát một event mỗi user thay vì mỗi (user, server),
  nên số lệnh phát còn giảm thêm; **chưa đo**.
- C so với B chỉ khác cờ `PRESENCE_SCOPED`. `WATCH=50` chỉ có tác dụng khi cờ bật (cờ tắt thì
  `presence.watch` không làm gì).

Chỉ số phụ (một mẫu, không suy ra nguyên nhân):

| Cấu hình | p95 hồi phục (ms) | trung vị (ms) | nối thất bại | event loop p99 (ms) | RSS (MiB) |
| -------- | ----------------- | ------------- | ------------ | ------------------- | --------- |
| A        | 5.484             | 2.519         | 40           | 145                 | 352       |
| B        | 3.643             | 980           | 53           | 45                  | 219       |
| C        | 2.157             | 1.088         | 49           | 47                  | 205       |

Profile 500 socket, cấu hình A, một instance (chạy trước, bỏ ra khỏi so sánh vì quá tải): p95 hồi phục
8.472 ms, 90 lần nối thất bại, `presence_received` 409.453, `presence_emitted_total` 1.366.

## Điểm nghẽn tìm thấy

- Trên một instance và cùng một máy với k6, 500 socket nối lại cùng lúc đã làm hỏng một phần kết nối
  (90 lần thất bại, p95 8,5 giây). Ở 300 socket vẫn còn 40–53 lần thất bại mỗi lần chạy. Nguyên nhân
  nối thất bại **chưa được điều tra** (nghi do tranh CPU giữa k6 và API trên cùng máy; chưa có bằng chứng).
- Fan-out presence là phần lớn lưu lượng của bài: ở A, `presence_received` là 99,3% số thông điệp WebSocket
  k6 nhận (486.644 trên 490.244).

## Giới hạn của lần đo này

- **Mỗi cấu hình một lần chạy**, chưa lặp lại; con số dao động giữa các lần chạy là chưa biết.
- **Cả ba lần đều vượt ngưỡng k6** (exit 99): `reconnect_failures` (40, 53, 49; ngưỡng dưới 3) và với A cả
  p95 hồi phục (5.484 ms so với ngưỡng 5.000 ms). Số nối thất bại khác nhau giữa các lần, nên số event nhận
  chịu ảnh hưởng nhẹ của số socket đang nối; ba lần có số nối thất bại gần nhau nên chênh lệch lớn (A → C)
  không đến từ đó, còn chênh lệch nhỏ (A → B 22,5%) thì có thể nhiễu.
- p95 hồi phục, event loop và RSS ở bảng phụ **không** dùng để kết luận batching hay scoped làm hệ thống
  nhanh hơn: một mẫu, k6 tranh CPU với API, số nối thất bại khác nhau.
- Một server 500 thành viên, mỗi socket đăng ký 50 người: đúng cho panel thành viên đã tải một trang,
  không đại diện cho server lớn hay nhiều server mỗi người.
- Một instance; gộp presence vẫn độc lập theo từng instance nên nhiều instance chưa đo (B2).
- Số đo trên laptop là trần của laptop này, không phải của production. Không có nhận định kiểu "chịu được N
  người dùng".
