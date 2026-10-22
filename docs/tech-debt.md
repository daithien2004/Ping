# Nợ kỹ thuật tại `v0.1.0`

Những gì đã biết và **cố ý chưa làm**, kèm bằng chứng và điều kiện nên làm. Ưu tiên: **P1** làm trước khi có tải thật hoặc
trước lần triển khai đầu; **P2** khi có số đo hoặc sự cố cho thấy cần; **P3** dọn dẹp, làm khi tiện.
Cập nhật tài liệu: 2026-10-22 (T0.2), đối chiếu nghiệm thu v0.1.0 và phạm vi
[v0.2.0](adr/0038-release-scope-v0.2.0.md). Số đo hiệu năng vẫn là các lần kiểm lịch sử, không
phải kết quả chạy lại trong task tài liệu này. P1 là việc cần xử lý hoặc đánh giá theo phạm vi
tải trước triển khai; không phải tất cả đã được giải quyết bởi kiểm tra local.

Nguồn số liệu: [báo cáo hiệu năng](perf/2026-10-20-baseline.md) và [bản đo lại sau sửa presence](perf/2026-10-20-presence-fix.md).

## P1

| Mục                                                                            | Bằng chứng                                                                                                                                                                                                                                                                                                                                    | Hướng giải                                                                                                                                         | Cần ADR?         |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Presence phát cho cả server: O(số thành viên) mỗi lần nối/ngắt**             | Bão kết nối lại 2.000 socket sinh ~4,9 triệu sự kiện trong 90 giây (bậc hai theo số thành viên)                                                                                                                                                                                                                                               | Chỉ gửi presence cho client đang xem danh sách thành viên (đăng ký theo server), hoặc gộp/giới hạn tần suất                                        | Có               |
| **Pool Postgres cố định 10 kết nối/instance**                                  | Cạn pool lúc nhiều người nối cùng lúc: "timeout exceeded when trying to connect" (4.902 lần), 503 khi một instance quá tải                                                                                                                                                                                                                    | Biến `PG_POOL_MAX`; nhớ `số instance × pool < max_connections`; PgBouncer hoặc pool của managed DB khi nhiều instance                              | Không (cấu hình) |
| **Chưa có runbook/backup cho nơi chạy thật (staging)**                         | Đã có `docs/runbook/deploy.md` cho stack local ([ADR-0036](adr/0036-local-deployment.md)); còn thiếu bản cho staging: chọn nơi chạy, tên miền, registry (`ghcr.io`), bước push image trong CI, cron `pg_dump` ra ngoài máy; mở cổng `METRICS_PORT` chỉ trong mạng nội bộ. **Chuyển v0.2.0** theo [ADR-0037](adr/0037-release-scope-v0.1.0.md) | Chọn nơi chạy, tên miền, registry (`ghcr.io`), bước push image trong CI, cron `pg_dump` ra ngoài máy; mở cổng `METRICS_PORT` chỉ trong mạng nội bộ | Có (khi chọn)    |
| **Kiểm Sentry ở staging và dựng Prometheus/Alertmanager nạp `ops/alerts.yml`** | Sentry thật API/web đã kiểm tại local ngày 2026-10-21; chưa đối chiếu mã UI trên staging; Prometheus/Alertmanager và nơi nhận cảnh báo chưa dựng. **Chuyển v0.2.0** (ADR-0037)                                                                                                                                                                | Cấu hình DSN của staging, gây lỗi 500 và kiểm nơi nhận cảnh báo; đóng tiêu chí "requestId → log → Sentry"                                          | Không            |

## Đã xác nhận

Branch protection của `main` đã bật theo [nghiệm thu v0.1.0](acceptance/v0.1.0.md), ghi nhận
ngày 2026-10-21. Không còn là việc P1 “bật lần đầu”. T0.2 chỉ đồng bộ tài liệu, chưa truy vấn
lại GitHub Settings và không thay quy tắc; khi đổi cấu hình, OWNER đối chiếu các check bắt buộc
trong [CONTRIBUTING](../CONTRIBUTING.md).

## P2

| Mục                                                                      | Bằng chứng                                                                                                    | Hướng giải                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Đếm socket của user bằng `fetchSockets()` liên instance mỗi lần nối/ngắt | 156 lần "timeout reached while waiting for fetchSockets response" dưới bão                                    | Bộ đếm theo user trong Redis (TTL + heartbeat)                                                       |
| Bão kết nối lại vẫn chậm                                                 | Sau khi sửa presence: p95 khôi phục 8,6–10,4 giây, ~1.700 lần socket không mở được mà server không log lỗi    | Đo lại trên máy chủ thật; nghi backlog chấp nhận kết nối hoặc event loop bão hòa trên máy đo         |
| Log `info` cho mọi request tốn CPU                                       | Chưa đo riêng; ở ~550 request/giây mỗi API đã dùng ~1 nhân                                                    | Bỏ `/health`, lấy mẫu khi tải cao; đo trước/sau                                                      |
| `keepAliveTimeout` mặc định 5 giây của Node                              | Một lần `ECONNRESET` dưới tải, chưa tái hiện                                                                  | Đo lại với Nginx hiện tại và cấu hình timeout API/proxy tương ứng; báo cáo gốc được đo khi còn Caddy |
| Web e2e từng đỏ một lần trên CI (khả năng flaky)                         | 1 trong 3 lần chạy; sau đó xanh; log không đọc được                                                           | Reporter `github` đã bật để lần sau thấy test nào hỏng; điều tra nếu lặp lại                         |
| CSP không dùng nonce (`'unsafe-inline'` cho script)                      | Next 16 yêu cầu render động cho nonce, trái `cacheComponents` ([ADR-0027](adr/0027-web-and-api-hardening.md)) | Xem lại khi Next hỗ trợ nonce với nội dung tĩnh                                                      |
| `RealtimeService.refreshAccess` duyệt mọi thành viên của server          | [ADR-0006](adr/0006-realtime-authorization-and-presence.md)                                                   | Chỉ duyệt thành viên mang role vừa đổi, hoặc đẩy vào hàng đợi, khi server lớn                        |

Theo dõi thêm cho P2: **Playwright teardown Windows chờ API watch**. Lần kiểm Nginx có 22/22 bài
xanh; runner thoát 0 sau khi dọn đúng cây API watch do nó tạo. Cần điều tra cách Playwright dừng
cây tiến trình Nest watch trên Windows; không kill theo tên `node.exe` vì có thể ảnh hưởng ứng dụng khác.

## P3

| Mục                                                                                                        | Ghi chú                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Image API ~660 MB                                                                                          | `node_modules` 496 MB (Prisma CLI đi kèm `@prisma/client`); không có rủi ro, chỉ tốn băng thông                                             |
| Lighthouse và quét Trivy chỉ báo cáo                                                                       | Chuyển thành bắt buộc khi ngưỡng đã ổn định vài lần chạy ([ADR-0032](adr/0032-ci-and-containers.md))                                        |
| Ghim action của GitHub theo SHA                                                                            | Đang dùng thẻ `@v4`; ghim SHA giảm rủi ro chuỗi cung ứng. Cảnh báo "Node 20 deprecated" của các action vô hại (GitHub tự chạy trên Node 24) |
| Chưa đo: 10.000 socket, `Member(serverId, id)` trên nhiều server, qua Nginx/mạng thật, tin dài 4.000 ký tự | Làm khi có môi trường staging ([perf/README](perf/README.md))                                                                               |
| Chưa có OpenTelemetry tracing, chưa có Sentry phía server của Next, chưa gom log (Loki/ELK)                | [ADR-0031](adr/0031-observability.md): làm khi có từ hai dịch vụ trở lên                                                                    |
| Chưa có slash command `new-module`                                                                         | Rút khuôn mẫu khi có module thứ hai thật                                                                                                    |
| Chưa chạy `promtool test rules` (kiểm hành vi cảnh báo, chỉ mới kiểm cú pháp)                              | Thêm khi có dữ liệu mẫu cho từng cảnh báo                                                                                                   |
