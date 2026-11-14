# V9 — Load test từ máy OWNER vào production (2026-11-14)

Bản chạy `37ae8cb` trên `https://20.193.75.48`, một instance API sau Nginx TLS. Máy bắn tải là
Windows của OWNER, cùng mạng nhà với VPS; k6 v1.7.1. Dữ liệu là server "Ping Demo" (3 kênh,
182 tin trước khi test), 30 user tải `load01…load30` tạo qua `POST /auth/register` và join bằng mã
mời, token lấy từ API thật (`scripts/loadtest-prod-tokens.mjs`) — không dùng JWT ký cục bộ.

Cấu hình VPS lúc đo (`nproc`, `free -m`, `docker stats --no-stream`): 2 vCPU, 3.911 MB RAM
(2.349 MB trống), 2 GB swap, 22 GB đĩa trống; 7 container, API dùng 569–958 MiB trong lúc đo.

## 1. REST — lịch sử tin

Lệnh (chạy trong `tools/loadtest`):

```bash
k6 run rest-history.js -e BASE_URL=https://20.193.75.48 -e RATE=<10|25|50> -e DURATION=60s
```

Mỗi vòng gọi 3 request: trang mới nhất, trang sâu, danh sách member. `RATE` là số vòng/giây, mỗi vòng
3 request, nên lưu lượng HTTP gấp ~3 lần RATE; có 10 giây warmup ở 20 vòng/giây trước mỗi nấc.

| Nấc (vòng/giây) | HTTP thực tế | p50    | p95    | max    | Lỗi                  | Vòng bị bỏ |
| --------------- | ------------ | ------ | ------ | ------ | -------------------- | ---------- |
| 10              | 29,4 req/s   | 604 ms | 1,28 s | 10,1 s | 0%                   | 25         |
| 25              | 57,7 req/s   | 845 ms | 1,72 s | 11,7 s | 0,12% (6/4738)       | 26         |
| 50              | 66,8 req/s   | 1,67 s | 7,37 s | 60,0 s | 19,07% (1.259/6.601) | 281        |

Theo từng endpoint ở nấc 10 / 25 / 50 (p95): trang đầu 2,73 s / 2,44 s / 7,89 s; trang sâu
1,09 s / 1,45 s / 7,54 s; member 1,50 s / 1,55 s / 5,62 s.

Cả 6 lỗi ở nấc 25 và 1.262 lỗi ở cửa sổ log Nginx của nấc 50 đều là **429**, không có 5xx: đây là
hạn mức theo người dùng (bucket lịch sử 120 request/phút, ADR-0080), không phải VPS quá tải. Ở nấc
50, mỗi user nhận ~2 vòng/giây × 2 request lịch sử ≈ 240 request/phút, gấp đôi hạn mức.

Tại sao dừng ở nấc 50: p95 7,37 s vượt ngưỡng dừng 2 giây của kế hoạch, dù CPU VPS chỉ 23% và load
average 1,45 trên 2 nhân. Throughput chững ở ~67 req/s trong khi tài nguyên server còn trống, và
k6 phải mở 501 VU, bỏ 281 vòng trên một máy Windows — giới hạn đo nằm ở máy bắn tải/đường mạng nhà,
không phải ở API. Không kết luận "VPS chịu được 67 req/s"; chỉ kết luận profile an toàn đo được từ
máy này là **10 vòng/giây (30 request/giây, p95 1,28 giây, 0 lỗi)**.

## 2. Socket — 30 và 100 listener

Lệnh:

```bash
k6 run socket-fanout.js -e BASE_URL=https://20.193.75.48 -e LISTENERS=<30|100> \
  -e SENDERS=3 -e SEND_RATE=2 -e DURATION=30s
```

3 user gửi 2 tin/giây (60 tin mỗi lần chạy, nội dung đánh dấu `LT|`) vào các kênh của Ping Demo;
số listener dùng lại 30 token, vì vậy 100 socket không phải 100 người khác nhau.

| Listener | Kết nối socket (p95) | Giao tin p95 | join lỗi | gửi lỗi | socket_errors |
| -------- | -------------------- | ------------ | -------- | ------- | ------------- |
| 30       | 589 ms               | 1,98 s       | 0        | 0       | 1             |
| 100      | 702 ms               | 2,00 s       | 0        | 0       | 0             |

100/100 listener hoàn thành vòng giữ kết nối 60 giây; `POST /messages` của sender p95 1,75 s, 0 lỗi.
Giao tin p95 ~2 giây không đạt ngưỡng 500 ms của kịch bản local, nhưng cùng cỡ với REST p95 ở nấc
10 (1,28 s) nên phần lớn là độ trễ mạng/khách, không phải fan-out phía server. `cross:true` bằng 0
vì production chỉ có một instance API — lần đo này **không** kiểm phát tin khác instance.

## 3. Kết luận

- **Có báo cáo giới hạn**, đúng yêu cầu của V9: profile an toàn từ máy OWNER là REST 10 vòng/giây
  (30 request/giây) và 100 socket đồng thời, không 5xx, không lỗi join/gửi.
- Nấc 25 vòng/giây vẫn dưới ngưỡng p95 2 giây nhưng bắt đầu chạm hạn mức 120 request/phút mỗi user;
  nấc 50 vòng/giây vượt ngưỡng dừng và bị 429 hàng loạt.
- Chưa chứng minh trần của VPS: CPU còn trống ở nấc cao nhất, client hết chỗ trước.

## 4. Giới hạn của lần đo

- Máy bắn tải và VPS cùng một đường mạng nhà; RTT và băng thông uplink ảnh hưởng trực tiếp p95.
- Dữ liệu nhỏ (182 tin, 3 kênh), không đại diện bộ 3 triệu tin của T0.6.
- Một instance API; không đo phát tin chéo instance, không scale ngang.
- 100 socket dùng lại 30 user, nên không kiểm hạn mức theo người ở mức 100 người thật.
- Không bật throttle CPU trên máy khách; số VU lớn (501) có thể chính là điểm nghẽn của k6.
- Threshold trong hai script là ngưỡng của profile local; các dòng "threshold crossed" ở trên là
  kết quả thật, không phải cấu hình sai.

## 5. Dọn dẹp

OWNER duyệt ngày 2026-11-14 và đã xoá trên production trong một transaction (`DELETE 138` tin,
`DELETE 34` user, `DELETE 2` server, `1` attachment):

- 30 user `load01…load30@example.com` và 120 tin `LT|` trong 3 kênh của "Ping Demo".
- 4 tài khoản test cũ của OWNER (`nghiaphan`, `khoikhang25`, `nghia`, `aadfa`) và 2 server `Dev`/`mk`.
- Giữ `daithien2004@gmail.com`, `owner-demo@ping.dev` (chủ "Ping Demo"), `demo1`, `demo2`; còn 4 user,
  1 server, 164 tin. Dump an toàn trước khi xoá: `D:\ping-backups\ping-before-cleanup-20261114.dump`.
- `tools/loadtest/data/tokens.json` và `meta.json` chỉ nằm trên máy OWNER (gitignored).

Báo cáo đầy đủ theo mẫu: [docs/perf/2026-11-14-vps.md](../../../perf/2026-11-14-vps.md).
