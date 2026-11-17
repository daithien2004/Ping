# ADR-0096: Gỡ đường cũ: presence phát cả server và Redis Stream

Status: accepted
Date: 2026-11-17

## Context

B3 và S1 đã thêm hai đường mới sau cờ, giữ đường cũ làm mặc định: `PRESENCE_SCOPED` ([ADR-0091](0091-presence-theo-thanh-vien-dang-xem.md))
và `BUS_DRIVER` ([ADR-0094](0094-kafka-lam-duong-chuyen-outbox.md)). OWNER yêu cầu nâng cấp thật chứ không để song song:
giữ hai đường nghĩa là phải test, đo và bảo trì cả hai, và hệ thống thật không hưởng lợi gì.

## Decision

1. Presence chỉ còn đường theo thành viên đang xem (`presence.watch`). Xóa cờ `PRESENCE_SCOPED` và nhánh phát tới room `server:*`.
2. Kafka là đường duy nhất của outbox → indexer. Xóa `BUS_DRIVER`, `RedisStreamPublisher`, `IndexerRunner` (Redis), cùng test, drill
   và benchmark chỉ phục vụ Redis Stream (`outbox-relay.e2e-spec`, `drill:indexer`, `drill:consumer-lag`, `loadtest:bus`).
3. Kafka thành dịch vụ chính ở `docker-compose.yml` (không còn profile) và ở `docker-compose.prod.example.yml` (chỉ trong mạng compose,
   heap 256–512 MB). `KAFKA_BROKERS` mặc định `localhost:9092` cho dev; production đặt `kafka:9092`. CI job `verify` có service Kafka.

## Consequences

- Client web cũ đã nạp sẵn không gửi `presence.watch` nên không thấy trạng thái online cho tới khi tải lại trang.
- VPS 4 GB RAM phải chạy thêm Kafka (~270–440 MB cố định). Kafka chết thì tin vẫn lưu và phát realtime; event outbox chờ và được phát lại
  (đã drill: `drill:kafka`).
- Mất các bài kiểm tra riêng cho việc worker indexer bị giết giữa chừng và độ trễ consumer của Redis Stream. Phần tương đương của Kafka
  chạy trong `kafka-bus.e2e-spec` (chia partition giữa consumer, lag, replay), nhưng chưa có drill giết worker trên Kafka.
- Số đo cũ (`docs/perf/2026-11-16-presence-scope.md`, `2026-11-17-bus-redis-vs-kafka.md`) vẫn là lịch sử của lúc còn hai đường;
  các script đo bão không còn tham số `PRESENCE_SCOPED`.
