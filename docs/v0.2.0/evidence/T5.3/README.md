# Bằng chứng T5.3 — Consumer indexer, chunk hội thoại và backfill

Commit: `f3f3d5e`; base: `88957db`.

## Phạm vi

- Consumer đọc `message.created`, `message.updated`, `message.deleted` từ `stream:outbox`.
- Mỗi point neo vào **id tin nhắn**; vector là **chunk cửa sổ** tối đa `AI_CHUNK_WINDOW` tin
  liền trước cùng channel, cắt theo trần `AI_CHUNK_MAX_TOKENS` (ước lượng `ceil(ký tự / 3)`).
- Upsert idempotent theo message id; sửa/xoá tin sẽ re-embed tối đa `windowSize - 1` tin phía sau
  vì cửa sổ của chúng chứa tin vừa đổi.
- Chỉ `XACK` sau khi xử lý xong; dùng `XAUTOCLAIM` nhận lại entry pending khi consumer chết.
- Backfill `ai:backfill` có giới hạn tốc độ, cursor `--after`, trần `--limit`; dùng chung
  `MessageIndexerCore` với consumer nên không ghi đè chunk bằng point một-tin.
- Metric `consumer_lag` = lag của group + số entry pending.

## Thiết kế

| Thành phần        | Giá trị / hành vi                                                                 |
| ----------------- | --------------------------------------------------------------------------------- |
| Stream / group    | `stream:outbox` / `ai-indexer` (mỗi instance một consumer name)                   |
| Point id          | UUID tin nhắn (neo)                                                               |
| Nội dung vector   | Cửa sổ tin liền trước cùng channel, tối đa `AI_CHUNK_WINDOW` tin                  |
| Giới hạn token    | `AI_CHUNK_MAX_TOKENS`, ước lượng `ceil(chars / 3)`                                |
| Payload Qdrant    | `serverId`, `channelId`, `authorId`, `createdAt`, `messageIds[]`, `modelVersion`  |
| Nội dung tin nhắn | **Không lưu** trong Qdrant; hydrate từ Postgres sau khi lọc quyền (T5.4)          |
| Sửa tin           | Upsert lại tin neo + `windowSize - 1` tin phía sau                                |
| Xoá tin           | Xoá point của tin + re-embed các tin phía sau                                     |
| Lỗi khi xử lý     | Không `XACK`; entry ở pending và được `XAUTOCLAIM` sau `AI_INDEXER_CLAIM_IDLE_MS` |
| Consumer lag      | Gauge Prometheus `consumer_lag`, cập nhật sau mỗi vòng xử lý                      |
| Redis xuống       | Outbox relay không đánh dấu `publishedAt`; event được thử lại sau                 |

Biến môi trường mới (`.env.example`):

```dotenv
AI_CHUNK_WINDOW=4
AI_CHUNK_MAX_TOKENS=512
AI_INDEXER_ENABLED=true
AI_INDEXER_CLAIM_IDLE_MS=30000
```

Tệp chính:

- `apps/api/src/modules/ai/indexer/message-chunker.ts`
- `apps/api/src/modules/ai/indexer/message-indexer.core.ts`
- `apps/api/src/modules/ai/indexer/indexer.runner.ts`
- `apps/api/src/modules/ai/indexer/message-indexer.service.ts`
- `apps/api/src/modules/ai/ai.tokens.ts` (tách token inject để tránh vòng import ESM)
- `apps/api/src/infra/events/outbox-relay.service.ts`
- `apps/api/src/modules/messages/messages.service.ts`
- `apps/api/scripts/lib/backfill.ts`, `apps/api/scripts/backfill-messages.ts`,
  `apps/api/scripts/rebuild-vector-index.ts`
- Test: `message-chunker.spec.ts`, `message-indexer.core.spec.ts`, `indexer.runner.spec.ts`,
  `test/messages.e2e-spec.ts`

Kiểm tra đã chạy: typecheck, **68 unit pass** (11 test indexer), **24 file e2e / 148 test pass**,
lint, build, `format:check`, `docs:check`. Hai test mô phỏng Redis chết (`DEAD_REDIS` và
`timeouts.e2e-spec.ts`) đổi từ cổng 6390 sang `127.0.0.1:1` vì máy dev có container
`omni-ai-agent-redis-1` chiếm cổng 6390, làm test "Redis chết" kết nối nhầm vào Redis thật.

## Vì sao point neo vào tin nhắn, không neo vào chunk

- Tin nhắn là đơn vị có id ổn định và có sẵn quyền/IDOR cần kiểm tra ở T5.4.
- Khi một tin bị sửa/xoá, chỉ cần upsert lại tối đa `windowSize` point thay vì tính lại id chunk
  (id chunk sẽ đổi khi nội dung thay đổi).
- Point trùng id được Qdrant upsert đè, nên xử lý lại sau crash không sinh bản ghi trùng.
- `messageIds[]` trong payload cho phép T5.4 lấy toàn bộ tin của chunk rồi hydrate nội dung từ
  Postgres, sau đó lọc quyền trên từng tin.

## Kết quả đo

Môi trường: Windows 11, Node v24.22.0, Qdrant v1.12.4 (Docker), Redis/Postgres local,
embedding `Xenova/multilingual-e5-small` (ONNX q8, 384 chiều).

### 1. Kill consumer giữa chừng

`pnpm --filter api drill:indexer` — 40 tin, worker thật + FakeEmbedder, kill khi mới ghi 6 point:

| Chỉ số                 | Giá trị |
| ---------------------- | ------- |
| Tin seed               | 40      |
| Point trước khi kill   | 6       |
| Entry pending lúc kill | 5       |
| Point sau khi chạy lại | 40      |
| Thiếu (`missing`)      | 0       |
| Trùng (`duplicates`)   | 0       |
| Thừa (`extra`)         | 0       |
| Tập id khớp            | `true`  |
| Tổng thời gian         | 8,9 s   |

Entry đã upsert nhưng chưa kịp `XACK` nằm lại pending; consumer mới `XAUTOCLAIM` và xử lý lại.
Upsert theo id tin nhắn nên không tạo point trùng. Output thô: `drill-output.txt`.

### 2. Metric `consumer_lag`

`pnpm --filter api build` rồi `pnpm --filter api drill:consumer-lag`. Script chạy API thật với
`METRICS_PORT`, đẩy 200 event vào stream và scrape `GET /metrics` trong lúc consumer còn xử lý:

| Thời điểm           | `consumer_lag`                                |
| ------------------- | --------------------------------------------- |
| Trước khi đẩy event | 0                                             |
| Cao nhất quan sát   | 198                                           |
| Dãy mẫu             | 198 → 188 → 178 → 168 → 158 → 148 → 138 → 128 |

Metric có mặt trên `/metrics` và giảm dần khi consumer xử lý hết. Output thô: `consumer-lag.txt`.

### 3. Backfill có giới hạn tốc độ

`pnpm --filter api ai:backfill -- --rate=20 --limit=60` trên dữ liệu dev (60 tin):

| Lần chạy | Tin xử lý | Thời gian | Tin/giây | Point sau chạy |
| -------- | --------- | --------- | -------- | -------------- |
| Đầu      | 60        | 8,5 s     | 7,05     | 60             |
| Lặp lại  | 60        | 6,2 s     | 9,73     | 60             |

Trần đặt 20 tin/giây nhưng embedding CPU chỉ đạt ~7–10 tin/giây, nên trần không bị vượt. Lần
chạy lại vẫn 60 point, xác nhận idempotent. Output thô: `backfill-output.txt`,
`backfill-idempotent.txt`.

### 4. Chunk và payload

Mẫu point (`qdrant-chunk-sample.json`): point `...0502` có `messageIds` gồm `...0501` và `...0502`,
không có trường `content`. Mẫu point đầu channel (`qdrant-point-sample.json`) có `messageIds` một
phần tử vì không có tin liền trước.

## Lệnh tái lập

```bash
# Qdrant local phải chạy; .env cần DATABASE_URL, REDIS_URL
export QDRANT_URL=http://localhost:6333

pnpm --filter api typecheck
pnpm --filter api test -- src/modules/ai/indexer
pnpm --filter api test:e2e -- messages
pnpm --filter api drill:indexer

pnpm --filter api build
pnpm --filter api drill:consumer-lag

pnpm --filter api ai:backfill -- --rate=20 --limit=60
pnpm --filter api ai:rebuild -- --recreate
```

Lưu ý: `drill:consumer-lag` dùng tin có thật trong DB dev và upsert lại vector (idempotent); không
sửa nội dung tin. Drill xoá `stream:outbox` trước/sau khi chạy, nên không chạy khi đang cần giữ
event chưa xử lý.

## Hạn chế

- Backfill xử lý tuần tự từng tin. Trần 20 tin/giây không đạt trên CPU laptop vì embedding là
  điểm nghẽn; muốn nhanh hơn phải batch embedding hoặc chạy nhiều worker theo channel.
- Cửa sổ chỉ lấy tin **liền trước**, không lấy tin phía sau. Tin đầu channel chỉ có chính nó.
- Sửa/xoá chỉ re-embed tối đa `windowSize - 1` tin phía sau; nếu sau này tăng cửa sổ cần rebuild.
- Chưa có truy vấn vector (T5.4/T5.5); T5.3 mới là đường ghi và phục hồi.
- `consumer_lag` là số entry chưa xử lý xong, không phải độ trễ thời gian (chưa có timestamp event
  trong stream). Muốn đo độ trễ cần thêm field thời gian phát event.
- Chưa chạy drill trên môi trường nhiều instance; `XAUTOCLAIM` đã dùng consumer name riêng nhưng
  chưa đo tranh chấp giữa nhiều worker.
