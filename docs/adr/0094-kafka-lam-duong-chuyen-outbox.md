# ADR-0094: Kafka là đường chuyển outbox → indexer

Status: accepted — OWNER chọn Kafka làm đường duy nhất; cờ `BUS_DRIVER` và Redis Stream đã gỡ ở [ADR-0096](0096-bo-cho-cu-presence-va-redis-stream.md). Phần "Bằng chứng" bên dưới ghi lại lúc còn hai đường.
Date: 2026-11-17

## Context

`OutboxEvent` ghi cùng transaction với dữ liệu nghiệp vụ; `OutboxRelayService` quét bằng `SKIP LOCKED`
([ADR-0090](0090-outbox-relay-skip-locked.md)) rồi `XADD` vào Redis Stream `stream:outbox`; `IndexerRunner` đọc bằng
consumer group `ai-indexer` và là consumer duy nhất. Realtime tới client **không** đi qua outbox, nên đổi đường chuyển
này không ảnh hưởng độ trễ hay khả năng scale của socket.

Mục tiêu của OWNER là học một message broker thật bằng chính luồng này. Hai ứng viên: Kafka và RabbitMQ.

Điểm yếu thật của luồng hiện tại (đối chiếu code 2026-11-17):

- `XADD` không có `MAXLEN` và không có `XTRIM` ở bất kỳ đâu: `stream:outbox` lớn mãi **trong RAM của Redis**, dùng chung
  với rate limit, presence và cache.
- `handleEvent` đọc lại trạng thái tin từ Postgres rồi `upsert`/`delete` điểm vector, nên hội tụ đúng với một consumer.
  Với **từ hai consumer trở lên** cùng group, một `syncMessage` đang embed dở có thể `upsert` lại điểm **sau** khi
  `deleteMessage` của consumer khác đã xóa: tin đã xóa vẫn tìm được qua AI. Redis group không có thứ tự theo khóa.
- Consumer group mới (ví dụ re-index sau khi đổi `EMBEDDING_MODEL`) không đọc lại được lịch sử nếu stream bị cắt;
  hiện việc đó đi qua script `ai:rebuild` đọc thẳng DB.

## Decision

1. **Chọn Kafka** (không chọn RabbitMQ), vì ba tính chất khớp với ba điểm trên và đều quan sát được trong code:
   - **Thứ tự theo khóa:** khóa của bản ghi là `payload.id` (id tin), nên mọi event của một tin nằm cùng partition và do
     một consumer của group xử lý tuần tự. RabbitMQ với nhiều consumer cạnh tranh trên một queue không giữ thứ tự theo
     khóa nếu không thêm exchange băm nhất quán hoặc single-active-consumer (mất song song).
   - **Giữ log trên đĩa theo thời gian** (`retention.ms` = 7 ngày) thay vì trong RAM Redis; consumer group mới replay
     được từ đầu mà không đụng offset của group cũ. Hàng đợi RabbitMQ xóa tin sau ack.
   - **Lag là khái niệm của group** (offset cuối trừ offset đã commit) nên `consumer_lag` có nghĩa chính xác.
2. **Cờ `BUS_DRIVER=redis|kafka`, mặc định `redis`.** Không đổi hành vi hiện tại khi không đặt. `kafka` bắt buộc
   `KAFKA_BROKERS` (kiểm bằng schema). Thêm `KAFKA_TOPIC` (mặc định `ping.outbox`), `KAFKA_PARTITIONS` (3),
   `KAFKA_CLIENT_ID`.
3. **Cổng `EventPublisher`** (`isUp`, `publish`) với hai bản cài đặt: `RedisStreamPublisher` (giữ nguyên `XADD`) và
   `KafkaPublisher`. Relay chỉ biết `isUp`: đường chuyển chết thì để event nằm yên, không đốt `attempts` (giữ ADR-0090).
   Indexer chọn `IndexerRunner` (Redis) hoặc `KafkaIndexerRunner` qua `IndexerLoop`.
4. **Postgres vẫn là nguồn sự thật.** Mất Kafka thì relay phát lại; xử lý là **at-least-once** (producer idempotent,
   `acks=-1`; consumer chỉ commit sau khi `handleEvent` xong; handler lỗi thì thử lại cùng offset, không bỏ qua).
   Không tuyên bố exactly-once.
5. **Hạ tầng:** `docker-compose.yml` (dev) có service `kafka` (Apache Kafka 3.9.0, KRaft một node, heap ≤ 512 MB) dưới
   profile `kafka`, nên `docker compose up -d` mặc định không bật. `dependency_up{name="kafka"}` (quy tắc 21) tự
   đăng ký khi dùng `KafkaPublisher`.
6. **Thư viện:** `kafkajs@2.2.4`, thuần JS nên chạy được trên Windows và trong image mà không cần build native. Rủi ro:
   bản phát hành cuối là 2023-02; thay thế dự kiến là `@confluentinc/kafka-javascript` (librdkafka) nếu cần tính năng mới.

## Alternatives

- **RabbitMQ:** nhẹ hơn Kafka và dạy exchange/queue/DLQ rất tốt, nhưng không có replay và không giữ thứ tự theo khóa với
  consumer song song (xem trên). Có thể làm một spike riêng để so sánh khi cần học thêm.
- **Giữ Redis Stream và thêm `MAXLEN`/`XTRIM`:** rẻ nhất cho điểm yếu RAM; không giải quyết thứ tự theo khóa hay replay, và
  cắt theo độ dài có thể bỏ event chưa được consume nếu lag dài. Không làm trong ADR này.
- **Không có cổng, thay thẳng bằng Kafka:** loại vì mất đường lui và mất khả năng so sánh trực tiếp hai bên.

## Consequences

- **Chưa bật ở production.** `docker-compose.prod.example.yml` không đổi (đổi compose mẫu phải dựng lại stack và chạy
  `apps/api/test/smoke/prod-stack.mjs`, chưa làm); Kafka trên VPS 2 vCPU / ~3,9 GB còn phải đo RAM thật.
- Một broker, replication factor 1: **không có HA**. Mất đĩa broker là mất log (Postgres vẫn đủ để dựng lại qua `ai:rebuild`).
- Đổi số partition sau khi đã có dữ liệu làm đổi cách khóa phân bổ, và thứ tự cũ-mới của cùng một khóa có thể lẫn tạm thời.
- Không thay thế `ai:rebuild` cho dữ liệu cũ hơn retention.
- Thêm một phụ thuộc hạ tầng và một dependency npm: lý do là mục tiêu học (OWNER), không phải nhu cầu tải.

## Bằng chứng

- **Test:** unit (`indexer-event`, `env.schema`, relay) và e2e với Kafka thật (`kafka-bus.e2e-spec.ts`, `kafka-relay.e2e-spec.ts`,
  tự bỏ qua khi không có `KAFKA_BROKERS`): hai consumer song song cùng group vẫn xử lý các event của một tin đúng thứ tự và mỗi tin chỉ
  một consumer; handler lỗi thì được xử lý lại rồi mới commit; lag về 0; group mới replay toàn bộ. Toàn bộ e2e api: 48 file, 385 test xanh.
- **Drill outage** (`pnpm --filter api drill:kafka`, 14/14 bước): dừng Kafka khi API chạy `BUS_DRIVER=kafka` thì REST vẫn 201 trong
  ~30 ms, event nằm yên (`pending=5`, `attempts` lớn nhất 0) và được phát hết khi Kafka về, không restart API.
- **Hai lỗi tìm thấy nhờ đo thật, đã sửa:** (1) `kafkajs` không phát `DISCONNECT` khi broker chết và `producer.send` treo ~47 giây
  rồi mới ném lỗi, trong lúc relay giữ khóa hàng và một kết nối DB. Nay producer thất bại nhanh (`retries: 1`), tự đánh dấu chết cho tới
  khi kết nối lại, và relay không đốt `attempts` khi đường chuyển vừa chết giữa lô (áp dụng cả cho Redis). (2) Bộ lọc thời gian của drill
  ban đầu lệch 7 giờ múi giờ (`timestamp` không múi giờ so với `Date` địa phương), làm mọi số `pending` bằng 0 và drill pass sai.
- **Số đo S1** ([báo cáo](../perf/2026-11-17-bus-redis-vs-kafka.md), 3.000 event, hai lần chạy mỗi bên): Redis phát nhanh hơn Kafka
  khoảng 4 lần (≈3.100 so với 670–820 event/giây, producer tuần tự) và nhẹ hơn nhiều (12 MiB so với 268–442 MiB RAM container);
  Redis tốn ~139 byte RAM cho mỗi event của một stream không cắt tỉa. Độ trễ hai bên không so trực tiếp được. Kafka **không** nhanh hơn;
  lý do chọn nó là tính chất thiết kế (thứ tự theo khóa, log trên đĩa, replay), không phải hiệu năng.
- `kafkajs` 2.2.4 chạy được trên Node v24.22.0, có cảnh báo `TimeoutNegativeWarning` (không ảnh hưởng kết quả đã quan sát).
