# Báo cáo hiệu năng — Bão socket có làm REST chậm khi chung một process? (2026-11-17)

Câu hỏi (B4 trong kế hoạch scale): tải giữ kết nối (bão reconnect) và tải REST tranh tài nguyên trong cùng một instance
API đến mức đáng tách realtime thành service riêng? Phép đo: `rest-history` chạy một mình, chạy chồng lên
`reconnect-storm`, và chạy chồng lên storm khi bật presence theo thành viên đang xem ([ADR-0091](../adr/0091-presence-theo-thanh-vien-dang-xem.md)).

## Môi trường

| Mục              | Giá trị                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Máy              | Laptop Intel i5-11400H, 12 luồng, 15,8 GiB RAM, Windows 11                                             |
| Postgres / Redis | Docker Desktop, **VM 12 CPU và 3,1 GB RAM** (baseline 2026-10-20 dùng VM ~7,6 GB: không so tuyệt đối)  |
| Số instance API  | 1 process native (`dist/main.js`, `TRUST_PROXY=1`, `PG_POOL_MAX` mặc định 10)                          |
| Phiên bản app    | nhánh `feat/scale-b2-b6`, base `047fd6c`                                                               |
| Dữ liệu          | `ping_load`: 500 user, một server 500 thành viên, 3 channel, 300.000 tin (kênh nóng ~207.700 tin)      |
| Công cụ          | k6 v1.7.1, cùng máy                                                                                    |
| Storm            | 300 socket, 3 vòng, giữ 15 giây; `PRESENCE_BATCH_MS=1000`; scoped = `PRESENCE_SCOPED=true`, `WATCH=50` |

Lệnh: `RATE=<vòng/giây> bash tools/loadtest/storm-rest-impact.sh <nhãn> <storm 0|1> 1000 <scoped> <watch>`. Mỗi vòng
`rest-history` ≈ 5 request (trang đầu, 4 trang sâu, 25% có thêm danh sách thành viên). Số liệu thô:
[data/2026-11-17-gateway-isolation/](data/2026-11-17-gateway-isolation/).

## Kết quả (một mẫu mỗi cấu hình)

REST p50 / p95 / max (ms), cùng một phiên đo, k6 cùng máy:

| Cấu hình                       | `RATE=15` (~70 req/s) | p95 so với REST một mình | `RATE=40` (~110–145 req/s) | p95 so với REST một mình |
| ------------------------------ | --------------------- | ------------------------ | -------------------------- | ------------------------ |
| REST một mình                  | 558 / 1.203 / 1.946   | 1,0×                     | 1.244 / 2.053 / 3.340      | 1,0×                     |
| REST + storm (mặc định)        | 1.156 / 2.392 / 3.905 | **2,0×**                 | 2.755 / 6.242 / 11.332     | **3,0×**                 |
| REST + storm + presence scoped | 1.115 / 1.666 / 2.463 | **1,4×**                 | 1.629 / 2.527 / 4.222      | **1,2×**                 |

Phụ: vòng bị bỏ (`dropped_iterations`) ở `RATE=40`: 168 → 465 → 244; ở `RATE=15`: 65 → 70 → 64. Tỉ lệ lỗi HTTP 0% ở cả sáu
lần. Event loop lag p99 (tích lũy từ lúc process chạy): 29 / 45 / 46 ms ở `RATE=15`; 61 / 92 / 69 ms ở `RATE=40`.

Hai lần chạy đầu bị bỏ: `RATE=100` quá tải (~500 req/s, p95 9,6–15 giây, 6% lỗi ở lần có storm mặc định) và thiếu mốc
"một mình" vì instance khởi động chậm quá 30 giây của `run-instances.mjs` (đã thêm retry vào script).

## Điều rút ra và điều chưa rút ra

- Trong cùng một process, bão reconnect làm REST chậm đi rõ rệt (p95 gấp 2–3 lần ở cả hai mức tải). Đúng chiều với giả thuyết của B4.
- Presence theo thành viên đang xem lấy lại phần lớn khoảng cách (còn 1,2–1,4× so với REST một mình), tức phần lớn
  nhiễu đến từ fan-out presence mà B3 đã bỏ, không cần service mới.
- **Cơ chế chưa được chứng minh.** Event loop lag chỉ tăng nhẹ, nên không giải thích được mức chậm 2–3 lần. Giả thuyết cần thử
  tiếp: truy vấn lúc nối socket (`member.findMany`, kiểm quyền) tranh cùng pool Postgres 10 kết nối với REST. Thử bằng cách
  tăng `PG_POOL_MAX` hoặc tách pool; chưa làm.

## Giới hạn của lần đo này

- Mỗi cấu hình một lần chạy, chưa lặp lại; chênh 1,2× có thể là nhiễu.
- **REST một mình đã chậm** (p95 1,2 giây ở ~70 req/s, ngưỡng của kịch bản là 200 ms; k6 thoát 99 ở cả sáu lần). Nguyên nhân chưa
  điều tra; Docker VM chỉ còn 3,1 GB RAM so với 7,6 GB ở baseline cũ, nên số tuyệt đối không so được và không phản ánh trạng thái
  khỏe. Chỉ so tương đối trong cùng phiên.
- 300 socket, một server, một instance, k6 cùng máy; không phải số của production.
- Chưa đo "deploy làm rớt socket" ở đây; xem [báo cáo scale-out](2026-11-17-scale-out.md) cho cuốn chiếu.
