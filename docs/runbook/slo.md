# SLO và ngân sách lỗi

Trạng thái: **đề xuất**. Ping chưa có lưu lượng production để hiệu chỉnh; các mục tiêu dưới đây là điểm khởi đầu để có thứ mà
cảnh báo đo theo, và phải chỉnh sau khi có dữ liệu thật ([ADR-0031](../adr/0031-observability.md)).

## Mục tiêu (tính trên 30 ngày)

| SLI                                  | Mục tiêu | Ngân sách                  | Nguồn số liệu                                             |
| ------------------------------------ | -------- | -------------------------- | --------------------------------------------------------- |
| Tỉ lệ request không trả 5xx          | 99,5%    | 0,5% request được phép 5xx | `http_request_duration_seconds_count{status_class="5xx"}` |
| Tỉ lệ request hoàn thành dưới 500 ms | 95%      | 5% request được phép chậm  | `http_request_duration_seconds_bucket{le="0.5"}`          |

4xx không tính vào ngân sách lỗi vì là lỗi của client (hết hạn mức, không có quyền, dữ liệu sai). Bucket 0,5 giây là một trong các
bucket mặc định của `prom-client` nên không cần đổi code.

## Cách đổi ngân sách thành cảnh báo

Ngân sách 0,5% trong 30 ngày tương đương khoảng 3,6 giờ sập hoàn toàn. Cảnh báo theo **tốc độ đốt** (bội số của mức đốt cho phép), với hai
cửa sổ cùng vượt mới báo để cảnh báo tự tắt khi sự cố đã hết (mẫu "multiwindow, multi-burn-rate" của Google SRE Workbook):

| Cảnh báo                    | Điều kiện (lỗi 5xx; độ trễ dùng ngân sách 5%)        | Hành động |
| --------------------------- | ---------------------------------------------------- | --------- |
| `PingErrorBudgetFastBurn`   | đốt gấp 14,4 lần ở cả 1 giờ và 5 phút (tỉ lệ > 7,2%) | gọi người |
| `PingErrorBudgetSlowBurn`   | đốt gấp 6 lần ở cả 6 giờ và 30 phút (tỉ lệ > 3%)     | mở ticket |
| `PingLatencyBudgetFastBurn` | 14,4 lần ở 1 giờ và 5 phút (> 72% request chậm)      | gọi người |
| `PingLatencyBudgetSlowBurn` | 6 lần ở 6 giờ và 30 phút (> 30% request chậm)        | mở ticket |

Quy tắc ở `ops/alerts.yml` (nhóm `ping-slo`), xử lý ở [alerts.md](alerts.md).

## Đã kiểm chứng gì

- `promtool check rules`: 19 quy tắc hợp lệ. `promtool test rules ops/monitoring/slo.test.yml` (chạy trong CI) kiểm bằng chuỗi số liệu
  giả lập: 10% lỗi báo đốt nhanh; 0,3% lỗi không báo gì; 4% lỗi chỉ mở ticket đốt chậm (dưới ngưỡng đốt nhanh); 80% request chậm báo đốt
  độ trễ nhanh; không có lưu lượng thì không báo.
- Khi viết test, một kỳ vọng sai của tác giả đã bị `promtool` bắt: tỉ lệ của hai `rate` không phụ thuộc độ dài cửa sổ khi đã có dữ liệu, nên
  cảnh báo đốt nhanh bật ngay khi cả hai cửa sổ có mẫu (sau `for: 2m`), không phải chờ đủ 1 giờ.

## Chưa làm

- Chưa có Prometheus/Alertmanager chạy thật nhận các quy tắc này, nên chưa kiểm cảnh báo tới được người nhận.
- Chưa có lưu lượng production: mục tiêu 99,5% và 95% dưới 500 ms chưa được đối chiếu với thực tế. Số đo cục bộ trong
  [báo cáo cô lập gateway](../perf/2026-11-17-gateway-isolation.md) (p95 vài trăm ms tới vài giây dưới tải thử, trong Docker VM nhỏ) không phải
  căn cứ cho mục tiêu production.
- SLO riêng cho realtime (độ trễ giao tin, tỉ lệ nối lại thành công) chưa đặt vì chưa có metric tương ứng.
