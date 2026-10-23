# Bằng chứng T5.2 — Qdrant local và quy trình rebuild từ Postgres

## Phạm vi

- Thêm Qdrant vào compose local, chỉ publish trên loopback; compose production không publish cổng.
- Định nghĩa collection theo `embedding_model + số chiều + phiên bản schema`.
- Payload `{serverId, channelId, authorId, createdAt, messageIds[], modelVersion}`, **không lưu nội dung
  tin nhắn**.
- Adapter `QdrantVectorStore` (REST) sau port `VectorStore`: tạo collection, payload index, upsert
  idempotent, xoá theo message id, đếm, health.
- Script `ai:rebuild` dựng lại toàn bộ chỉ mục từ Postgres (nguồn sự thật) và kiểm tra số point.
- Đo thử trên database tạm `ping_t52` (5 tin chưa xoá + 1 tin đã xoá), sau đó xoá database/collection.

## Thiết kế

| Thành phần        | Giá trị                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| Collection        | `messages__xenova_multilingual_e5_small__384__v1`                                     |
| Công thức         | `messages__<model-slug>__<dimensions>__v<schema>`                                     |
| Vector            | 384 chiều, distance `Cosine`                                                          |
| Point id          | UUID tin nhắn (upsert idempotent)                                                     |
| Payload index     | `serverId`, `channelId`, `authorId`, `modelVersion` (keyword); `createdAt` (datetime) |
| Payload           | `serverId`, `channelId`, `authorId`, `createdAt`, `messageIds[]`, `modelVersion`      |
| Nội dung tin nhắn | **Không lưu** trong Qdrant; hydrate lại từ Postgres ở T5.4                            |

Tệp chính:

- `apps/api/src/modules/ai/vector-store.port.ts`
- `apps/api/src/modules/ai/qdrant-vector-store.ts`
- `apps/api/src/modules/ai/vector-schema.ts`
- `apps/api/scripts/rebuild-vector-index.ts`
- `docker-compose.yml`, `docker-compose.prod.example.yml`
- Test: `qdrant-vector-store.spec.ts`, `vector-schema.spec.ts`

## Cổng không công khai

Local chỉ bind loopback; production không có mục `ports` cho Qdrant:

```text
NAME            STATUS                        PORTS
ping-qdrant-1   Up About a minute (healthy)   127.0.0.1:6333-6334->6333-6334/tcp

TCP    127.0.0.1:6333    0.0.0.0:0    LISTENING
TCP    127.0.0.1:6334    0.0.0.0:0    LISTENING
```

Chi tiết: `ports.txt`. API trong compose production nhận `QDRANT_URL=http://qdrant:6333` qua mạng nội bộ.

## Rebuild / backup

Postgres là nguồn sự thật; Qdrant chỉ là chỉ mục có thể dựng lại. Không cần backup Qdrant để phục hồi
dữ liệu.

```bash
# Dựng lại sạch (xoá collection rồi tạo lại) sau khi đổi model/schema
pnpm --filter api ai:rebuild -- --recreate

# Cập nhật tăng dần, giữ point cũ (idempotent theo message id)
pnpm --filter api ai:rebuild

# Giới hạn lô để chạy nền
pnpm --filter api ai:rebuild -- --batch 32
```

Quy trình khi Qdrant hỏng/mất volume:

1. Khởi động Qdrant mới (compose).
2. Chạy `ai:rebuild --recreate`.
3. Kiểm tra `points` trả về bằng số tin chưa xoá trong Postgres.

Qdrant snapshot chỉ dùng để khởi động ấm nhanh (tuỳ chọn):
`POST /collections/{name}/snapshots` rồi `PUT /collections/{name}/snapshots/recover` với
`location` trỏ tới file snapshot trên volume. Không dùng snapshot làm nguồn sự thật.

## Kết quả đo

Môi trường: Windows 11, Node v24.22.0, Qdrant v1.12.4 (Docker), model e5-small đã cache.

| Lần chạy                     | Tin chưa xoá | Point sau chạy | Lô  | Thời gian | Ghi chú                             |
| ---------------------------- | ------------ | -------------- | --- | --------- | ----------------------------------- |
| `--recreate`                 | 5            | 5              | 1   | 11,1 s    | Gồm nạp model lần đầu trong process |
| `--batch 2` (không recreate) | 5            | 5              | 3   | 1,4 s     | Chạy lại không nhân đôi point       |

Tin đã soft-delete (`deletedAt`) không được index: 6 tin trong DB, 5 point.

Collection sau khi tạo: `{"size":384,"distance":"Cosine"}`, đủ 5 payload index
(`qdrant-collection.json`). Mẫu point (`qdrant-points.json`) có đúng payload, không có trường nội dung.

Output thô: `rebuild-output.txt`, `rebuild-idempotent.txt`.

## Hạn chế

- Mỗi point = một tin nhắn; chunk hội thoại + xử lý sửa/xoá realtime là T5.3.
- Chưa có truy vấn vector (T5.4/T5.5); T5.2 mới là hạ tầng + ghi.
- Qdrant local không bật auth/TLS; chỉ dùng trong máy dev. Production phải chạy trong mạng nội bộ
  (compose mẫu đã không publish cổng).
- Số đo dùng database tạm, không dùng dữ liệu người dùng thật.

## Kiểm tra

- `pnpm --filter api typecheck`
- `pnpm --filter api test -- src/modules/ai` (19 test)
- `pnpm --filter api lint`
- `pnpm --filter api build`
- `pnpm --filter api test:e2e`
- `pnpm format:check`
- `pnpm docs:check`
