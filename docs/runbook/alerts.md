# Runbook: cảnh báo

Quy tắc ở `ops/alerts.yml`. Dựng Prometheus/Alertmanager (hoặc dịch vụ tương đương) là việc của hạ tầng:
file này chỉ là định nghĩa. Nguyên tắc chung: lấy `requestId` từ lỗi (giao diện hiển thị "Mã lỗi", Sentry có
tag `requestId`), tìm toàn bộ log có `requestId` đó; từ log tìm ra module.

## PingHighErrorRate

Hơn 2% request trả 5xx trong 5 phút. Nghĩa là có bug hoặc hạ tầng hỏng, không phải lỗi 4xx của client.

1. Mở Sentry: lỗi mới nhất theo thời gian, xem có đúng một nguyên nhân gốc không.
2. Xem `dependency_up`: nếu Postgres/Redis down thì xử lý theo hai mục dưới, đừng tìm bug.
3. Vừa deploy? Xem [rollback](rollback.md) (migration expand/contract cho phép chạy lại bản trước).

## PingPostgresDown

Postgres không trả lời. Mọi endpoint đọc/ghi trả 503, `/ready` trả 503 nên load balancer loại instance.
Khôi phục DB trước; API tự hồi phục, không cần restart. Chi tiết: `docs/runbook/failure-modes.md`.

## PingRedisDown

Chế độ suy giảm, không sập: REST và lưu tin nhắn vẫn chạy (Postgres là nguồn sự thật). Mất: realtime giữa
các instance, presence chính xác, cache, đăng nhập (fail-closed trả 503 để không mất giới hạn thử mật khẩu).
Khôi phục Redis; không cần xóa dữ liệu.

## PingSocketDropSpike

Hơn nửa số socket đang mở rớt trong 5 phút. Thường là: vừa deploy/restart hàng loạt (bình thường nếu client nối
lại ngay), load balancer ngắt kết nối nhàn rỗi (timeout WebSocket), hoặc lỗi mạng. Client tự nối lại và bù
tin lỡ qua REST nên không mất dữ liệu; kiểm tra tỷ lệ nối lại thành công.

## PingInstanceDown

Không scrape được `/metrics` của một instance: process chết hoặc cổng `METRICS_PORT` không tới được. Xem
`/health` của instance đó, log khởi động, và `kubectl describe` (hoặc tương đương).

## Kiểm tra toàn tuyến (làm ở staging, việc của người vận hành)

Gây một lỗi 500 có chủ đích, lấy mã lỗi từ giao diện, tìm ra log của request và lỗi tương ứng trên Sentry.
`test/error-tracking.e2e-spec.ts` đã chứng minh mã trên response, header và báo cáo Sentry là cùng một id.

Sentry thật của API/web đã được kiểm tại local ngày 2026-10-21; chưa đối chiếu đủ mã hiển thị trên UI
với Sentry ở staging. Prometheus/Alertmanager cũng chưa được dựng để nạp quy tắc; xem
[nghiệm thu](../acceptance/v0.1.0.md) và [nợ kỹ thuật](../tech-debt.md).
