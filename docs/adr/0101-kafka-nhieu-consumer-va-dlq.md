# ADR-0101: Nhiều consumer group và dead-letter queue trên Kafka

Status: accepted
Date: 2026-11-17

## Context

[ADR-0094](0094-kafka-lam-duong-chuyen-outbox.md) chọn Kafka nhưng chỉ có một consumer (indexer AI), nên chưa dùng thế mạnh của Kafka:
nhiều nhóm đọc độc lập một log, và xử lý event hỏng mà không chặn partition.

## Decision

1. `KafkaEventRunner` (`infra/events`) là consumer chung: mỗi group có offset riêng; chỉ commit sau khi xử lý xong (at-least-once); mỗi event thử tối đa
   `maxAttempts` (3) lần với backoff; hết lần thì chuyển sang `<topic>.dlq` kèm header `dlq-error`, `dlq-attempts`, `dlq-group`, `dlq-source`
   (`topic[partition]@offset`) rồi mới commit. Ghi DLQ lỗi thì ném lỗi (không commit, kafkajs thử lại): không mất event âm thầm.
2. `KafkaIndexerRunner` chỉ là cấu hình của runner chung. Consumer thứ hai `ActivityStatsService` (group `activity-stats`) đếm tin mới mỗi kênh mỗi ngày
   UTC vào Redis, **idempotent** bằng script Lua atomic (`SET NX` khóa theo id event rồi `INCR`): xử lý lại cùng event không đếm hai lần.
3. Span `indexer.handle` / `stats.count` nối tiếp trace của request tạo event (ADR-0100).

## Evidence

- `kafka-bus.e2e-spec` (6 test, gồm test DLQ): event làm handler lỗi mãi vào DLQ với `dlq-error`, `dlq-attempts=2`, `dlq-source`; các event khác vẫn xử lý.
- `drill:kafka-worker` (4/4): SIGKILL worker giữa chừng một event, consumer khác cùng group nhận lại event đó sau 29 giây (session timeout 30 giây).
- Unit test `ActivityStatsService`: đếm theo kênh và ngày, khóa dedupe theo id event, bỏ qua event không phải `message.created`.

## Consequences

- Redis chết lâu thì handler thống kê lỗi quá `maxAttempts` và event đi vào DLQ thay vì chờ. Chữa: phát lại từ DLQ; **chưa có công cụ phát lại**.
- Event "độc" bị đẩy sang DLQ sau ~vài trăm ms thử lại: thứ tự giữa các event cùng tin có thể đảo nếu event đầu vào DLQ (event sau vẫn chạy).
- Mọi bản sao API và worker đều chạy consumer; số consumer song song tối đa bằng số partition (3).
- Chưa đo: thông lượng thống kê ở tải lớn; chưa chạy trên VPS.
