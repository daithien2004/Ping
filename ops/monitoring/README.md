# Giám sát AI local (T5.11)

Stack độc lập: Prometheus + Grafana OSS, không cần tài khoản hay dịch vụ trả phí.
Không thay stack ứng dụng, không gửi thông báo ra email/Slack. Cảnh báo được xem
trực tiếp trong Prometheus; kết nối Alertmanager và nơi nhận thật thuộc staging.

## Chạy với API thật

Từ gốc repo, đặt `METRICS_PORT=19100` trong môi trường của **API do bạn chạy** rồi
khởi động API. Các cổng REST/web, Postgres và Redis giữ theo cấu hình môi trường đó.
Không mở cổng metrics ra internet; chỉ cho Prometheus trong mạng nội bộ truy cập.

```powershell
$env:METRICS_PORT = '19100'
pnpm --filter api dev
```

Ở terminal khác:

```powershell
docker compose -p ping-t511-monitoring -f ops/monitoring/compose.yml up -d
```

- Grafana: http://localhost:13030/d/ping-ai — dashboard được provision sẵn.
- Prometheus targets: http://localhost:19090/targets — `ping-api` phải `UP`.
- Cảnh báo: http://localhost:19090/alerts.

Stack dùng `host.docker.internal:19100` để scrape API trên host (Docker Desktop;
Linux có `host-gateway` trong compose). Nếu API chạy trong container/máy khác,
sửa danh sách targets trong `prometheus.yml` cho mạng nội bộ tương ứng.
Khi nhiều API/worker, liệt kê từng metrics endpoint dưới cùng job `ping-api`;
đảm bảo có ít nhất một API được scrape để thấy AI request và FTS. Bộ đếm cộng
across replicas; chi phí ngày là tổng toàn hệ thống từ DB nên dùng MAX, không SUM.
Mỗi Prometheus chỉ nên theo dõi một môi trường DB dưới job này.

## Thử cảnh báo không gọi LLM thật

Dừng API/fixture của chính bạn nếu đang dùng cổng 19100. Chạy:

```powershell
pnpm --filter api exec tsx scripts/drill-ai-metrics.ts
```

Fixture phát metrics từ `MetricsService` thật với adapter DB/Redis giả: chi phí
8,1/10 USD (81%), request/token/latency mô phỏng mỗi 3 giây. Không kết nối DB thật,
không gửi câu hỏi, không dùng API key. Stack trên sẽ chuyển `PingAiBudgetWarning`
sang **firing** sau hơn 2 phút (thêm tối đa hai chu kỳ scrape/evaluate 15 giây).
Dashboard có dữ liệu rate sau ít nhất hai scrape. Đây là demo dữ liệu mô phỏng;
không dùng ảnh này làm bằng chứng chi phí hoặc hiệu năng provider thật.
Ctrl+C dừng fixture.

## Kiểm thử rule

Từ gốc repo (PowerShell):

```powershell
$opsPath = (Resolve-Path ops).Path
docker run --rm --entrypoint /bin/promtool -v "${opsPath}:/work:ro" -w /work/monitoring prom/prometheus:v3.15.0 check rules ../alerts.yml
docker run --rm --entrypoint /bin/promtool -v "${opsPath}:/work:ro" -w /work/monitoring prom/prometheus:v3.15.0 test rules alerts.test.yml
```

Bao gồm: lớn hơn/đúng 80%, budget 0, DB lỗi, nhiều replica, đổi ngày và cảnh báo
mất khả năng đọc ngân sách. Kiểm thử API thật nằm trong `metrics.e2e-spec.ts`.

## Ý nghĩa số liệu

| Metric                                       | Phạm vi                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ai_requests_total{outcome}`                 | Số stream Ask theo kết quả; không gồm request bị guard từ chối trước stream                              |
| `ai_tokens_total{kind}`, `ai_cost_usd_total` | Token/chi phí ước tính trong vòng đời process; không dùng để tính ngân sách ngày                         |
| `ai_latency_seconds{outcome}`                | Từ lần đọc generator đầu tiên đến khi kết thúc/hủy, gồm retrieval/cache và thời gian consumer đọc stream |
| `ai_llm_duration_seconds`                    | Riêng lời gọi LLM, giữ nguyên metric T5.7                                                                |
| `qdrant_latency_seconds{outcome}`            | HTTP request tới response headers, gồm lỗi HTTP/mạng; không gồm parse body hay health probe              |
| `search_latency_seconds{outcome}`            | FTS service gồm validate, truy vấn và map kết quả; gồm lỗi                                               |
| `ai_daily_spent_usd`                         | Tổng `AiUsage.costUsd` của ngày UTC, đọc lại từ Postgres lúc scrape                                      |
| `ai_daily_budget_usd`                        | Ngân sách cấu hình; 0 = tắt giới hạn và cảnh báo 80%                                                     |
| `ai_budget_metrics_up`                       | 1 = đọc chi phí thành công; 0 = lỗi, spending xuất NaN                                                   |

Free tier có giá cấu hình bằng 0 thì token vẫn tăng nhưng chi phí bằng 0. Dashboard
không hiển thị % ngân sách khi ngân sách tắt; lỗi thu thập hiển thị health 0.
Không có dữ liệu request thì panel tương ứng có thể báo No data; histogram không
được tạo lưu lượng giả trong ứng dụng thật.

## Dừng và rollback

```powershell
docker compose -p ping-t511-monitoring -f ops/monitoring/compose.yml down
```

Lệnh giữ volume lịch sử Prometheus. Không dùng `down -v` nếu muốn giữ dữ liệu.
Ngừng scrape hoặc bỏ `METRICS_PORT` khỏi môi trường API để tắt giám sát; không có
migration DB. Cấu hình local cho phép anonymous Viewer và chỉ bind loopback;
staging cần cấu hình xác thực và mạng riêng trước khi triển khai.

Tham chiếu: [ADR-0061](../../docs/adr/0061-ai-observability.md),
[runbook cảnh báo](../../docs/runbook/alerts.md),
[prom-client 15.1.3](https://github.com/prometheus/client_js/tree/v15.1.3),
[kiểm thử rule](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/),
[Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/).
