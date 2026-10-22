# T0.6 — Baseline hiệu năng local trước sửa pool/presence

- Ngày: 2026-10-22 (UTC 04:58–05:02), Asia/Saigon.
- Người thực hiện: chủ repo, nhánh `chore/t0.6-performance-baseline`, base commit `1bcdcdd`.
- Task: T0.6 trong `docs/v0.2.0/status.md`. Kết quả chi tiết: [báo cáo](../../perf/2026-10-22-baseline.md).

## Môi trường và dữ liệu

- Windows x64, CPU `Intel64 Family 6 Model 141 Stepping 1`, 12 logical CPU, RAM host
  16.931.676.160 byte (~15,77 GiB). Docker Linux: 12 CPU, RAM 8.205.291.520 byte (~7,64 GiB).
- Node `v24.22.0`, pnpm `10.26.0`, k6 `v1.7.1` (commit `9f82e6f1fc`, Go `1.26.1`).
- Docker Engine `28.5.1`; Postgres `17.11`, Redis `7.4.11` trong Docker Compose dev.
- 3 API process chạy native trên host: HTTP 4001/4002/4003, metrics 9101/9102/9103; k6 trên host;
  DB/Redis cùng máy; không qua Nginx/TLS.
- Pool adapter mặc định `pg` (10/instance), chưa có `PG_POOL_MAX`; Redis DB 2 cho bài tải.
- Seed `ping_load`: 5.000 user, 50 channel, 3.000.000 tin; hot channel 814.130 tin.

## Kiểm chứng

| Tiêu chí đạt được                                                                                         | Lệnh/cách thức                                                                                             | Kết quả (`pass`/`fail`/`not-run`)                        | File log/ảnh/số đo                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Build và dựng stack local                                                                                 | `pnpm build`; `docker compose up -d`; `node tools/loadtest/run-instances.mjs 3`                            | pass                                                     | `seed.log`, log instance `tools/loadtest/data/api-*.log` |
| Seed dữ liệu tải                                                                                          | `pnpm --filter api loadtest:seed`                                                                          | pass (188s phần nạp)                                     | `seed.log`                                               |
| Lấy mẫu metrics trong lúc chạy                                                                            | `node tools/loadtest/sample-metrics.mjs t0.6-2026-10-22 9101,9102,9103 3`                                  | pass                                                     | `metrics.csv`, `metrics-summary.json`                    |
| REST history                                                                                              | `k6 run ... rest-history.js -e PORTS=4001,4002,4003 -e RATE=20 -e DURATION=40s`                            | pass (exit 0)                                            | `rest.json`, `rest.log`                                  |
| Socket fan-out                                                                                            | `k6 run ... socket-fanout.js -e PORTS=... -e LISTENERS=500 -e SEND_RATE=20 -e SENDERS=500 -e DURATION=60s` | pass (exit 0)                                            | `fanout.json`, `fanout.log`                              |
| Reconnect storm                                                                                           | `k6 run ... reconnect-storm.js -e PORTS=... -e SOCKETS=500 -e ROUNDS=3 -e HOLD_S=15`                       | pass (exit 0)                                            | `reconnect.json`, `reconnect.log`                        |
| Ngưỡng script (REST p95<200ms, lỗi<0,1%; send p95<200ms; fan-out p95<500ms; reconnect p95<5s, failure<1%) | xem summary k6                                                                                             | pass                                                     | `rest.json`, `fanout.json`, `reconnect.json`             |
| Ngưỡng ADR-0038 (REST p95<300ms, lỗi<1%, reconnect<15s)                                                   | xem summary k6                                                                                             | pass                                                     | `rest.json`, `reconnect.json`                            |
| Log API không có lỗi                                                                                      | đối chiếu log-offsets + metrics-summary                                                                    | pass (0 error, 0 presence warning, 0 pool/Redis timeout) | `log-offsets.json`, `metrics-summary.json`               |
| Format/docs/lint/typecheck/test/build                                                                     | không chạy trong task này (chỉ tài liệu/số đo, không đổi code)                                             | not-run                                                  | —                                                        |

Thứ tự và timestamp các lượt chạy lưu trong `runs.json`.

## Review, giới hạn và tiếp tục

- Phát hiện: tất cả ngưỡng đạt ở profile pilot; hai điểm cần theo dõi là độ trễ kết nối socket
  (p95 ~1,2–1,4 s) và event loop p99 trong reconnect storm (778,6 ms); RSS ~1,3 GB cho 3 instance/500 socket.
- Điều chưa đo: 10.000 socket, chạy dài nhiều giờ, chi phí hạ tầng thật, proxy/TLS, lặp lại cùng profile.
- Rollout/rollback: không có thay đổi code; chỉ thêm tài liệu và số đo. Rollback chỉ cần revert commit.
- Cách chạy lại: theo [runbook](../../perf/README.md) và lệnh trong báo cáo; giữ DB `ping_load` riêng,
  token fixture nằm ngoài Git.>
