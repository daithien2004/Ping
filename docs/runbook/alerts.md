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

## PingErrorBudgetFastBurn

Ngân sách lỗi 5xx (0,5% trong 30 ngày, [SLO](slo.md)) đang bị đốt nhanh gấp 14,4 lần mức cho phép: ở cả cửa sổ 1 giờ và 5 phút,
tỉ lệ 5xx vượt 7,2%. Giữ nguyên tốc độ này thì ăn 2% ngân sách tháng sau mỗi giờ. Làm như [PingHighErrorRate](#pinghigherrorrate):
Sentry, `dependency_up`, rồi nghĩ tới rollback. Hai cửa sổ cùng vượt để cảnh báo tự tắt nhanh khi lỗi đã hết.

## PingErrorBudgetSlowBurn

Tỉ lệ 5xx vượt 3% ở cả cửa sổ 6 giờ và 30 phút (gấp 6 lần mức cho phép). Không đủ gấp để gọi người nhưng sẽ hết ngân sách tháng
trong vài ngày. Mở ticket, tìm nguyên nhân âm ỉ (một endpoint hỏng, một lô dữ liệu xấu, pool kết nối thiếu).

## PingLatencyBudgetFastBurn

Ngân sách độ trễ (95% request dưới 500 ms) bị đốt nhanh gấp 14,4 lần: hơn 72% request chậm quá 500 ms ở cả cửa sổ 1 giờ và 5 phút.
Hay gặp: pool Postgres đầy (xem `PG_POOL_MAX` và số bản sao, [ADR-0092](../adr/0092-nhieu-ban-sao-api-sau-nginx.md)), một truy vấn mất index,
hoặc bão reconnect trong cùng process ([ADR-0093](../adr/0093-chua-tach-realtime-service.md)).

## PingLatencyBudgetSlowBurn

Hơn 30% request chậm quá 500 ms ở cả cửa sổ 6 giờ và 30 phút. Mở ticket; so với `http_request_duration_seconds` theo `route` để biết route nào kéo chậm.

## Kiểm tra toàn tuyến (làm ở staging, việc của người vận hành)

Gây một lỗi 500 có chủ đích, lấy mã lỗi từ giao diện, tìm ra log của request và lỗi tương ứng trên Sentry.
`test/error-tracking.e2e-spec.ts` đã chứng minh mã trên response, header và báo cáo Sentry là cùng một id.

Sentry thật của API/web đã được kiểm tại local ngày 2026-10-21; chưa đối chiếu đủ mã hiển thị trên UI
với Sentry ở staging. Prometheus/Alertmanager cũng chưa được dựng để nạp quy tắc; xem
[nghiệm thu](../acceptance/v0.1.0.md) và [nợ kỹ thuật](../tech-debt.md).

## PingAiBudgetWarning

Tổng chi phí AI ngày UTC vượt 80% `AI_DAILY_BUDGET_USD` liên tục 2 phút.
Dashboard local và cách chạy: [giám sát AI](../../ops/monitoring/README.md).

1. Xem chi phí ngày, ngân sách và `ai_budget_metrics_up` trên dashboard.
2. Kiểm tra request/token theo thời gian, tỷ lệ cache hit/lỗi và giá provider đang
   cấu hình. Không dùng tổng counter vòng đời process làm chi phí ngày.
3. Giữ trần ngân sách hoặc giảm lưu lượng AI khi cần; không tăng ngân sách tự động.
   Khi chạm 100%, kill-switch từ T5.7 từ chối lời gọi LLM mới; cache vẫn phục vụ.
4. Giá free tier bằng 0 cho chi phí bằng 0. Budget 0 tắt kill-switch và cảnh báo 80%.
   Ngày được reset ở 00:00 UTC, tức 07:00 Việt Nam.

Mọi replica đọc cùng tổng DB: rule dùng MAX, không SUM. Mẫu có collector lỗi bị loại.
Cảnh báo firing local chưa đồng nghĩa thông báo đã gửi tới nơi nhận staging.

## PingAiBudgetMetricsUnavailable

Không đọc được chi phí ngày từ Postgres liên tục 2 phút. Spending xuất NaN;
không diễn giải dashboard trống thành chi phí bằng 0. Kiểm `dependency_up`, log DB,
pool/timeout và quyền đọc `AiUsage`. Thu thập tự phục hồi khi DB trở lại; không cần
xóa counter, Redis hay dữ liệu chi phí. Nếu endpoint metrics không trả lời thì xử lý
`PingInstanceDown`.
