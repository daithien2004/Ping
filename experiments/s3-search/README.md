# S3 — tìm kiếm lai: FTS Postgres, Qdrant, pgvector, RRF

**Câu hỏi:** tìm theo nghĩa (vector) có thay được tìm theo từ khóa (FTS hiện có) không, nên dùng pgvector (cùng Postgres) hay Qdrant
(dịch vụ riêng), và kết hợp hai cách có đáng không?

**Cách đo:** `pnpm --filter api loadtest:search` (cần `docker compose up -d`, mô hình `Xenova/multilingual-e5-small` trong cache,
image `pgvector/pgvector:pg17`). 64 tin tiếng Việt thuộc 8 chủ đề (`corpus.mjs`), 8 truy vấn ngữ nghĩa (không dùng từ nào của chủ đề)
và 8 truy vấn khớp chính xác (mã như `CI-7741`, `AUTH_E4021`). Bốn bộ máy: FTS đúng như `search.service.ts` (không có nhánh join),
Qdrant, pgvector (HNSW), và hybrid = RRF(FTS, Qdrant). Kết quả thô: [result.json](result.json).

## Kết quả (một lần chạy, 16 truy vấn)

| Bộ máy              | Ngữ nghĩa: P@5 / hit@1 / MRR | Chính xác: hit@1 / MRR | Truy vấn TB (ms) |
| ------------------- | ---------------------------- | ---------------------- | ---------------- |
| FTS (Postgres)      | 0 / 0 / 0                    | 1 / 1                  | 0,72             |
| Qdrant              | 0,575 / 0,75 / 0,875         | 0,875 / 0,938          | 2,11             |
| pgvector            | 0,575 / 0,75 / 0,875         | 0,875 / 0,938          | 0,81             |
| Hybrid FTS + Qdrant | 0,575 / 0,75 / 0,875         | 1 / 1                  | 3,30             |

## Kết luận (và giới hạn)

- FTS không tìm được gì theo nghĩa (0/8) nhưng khớp mã chính xác tuyệt đối; vector làm ngược lại và hụt một mã (hit@1 0,875).
  Hybrid giữ cả hai: nghĩa như vector, mã chính xác như FTS. Đó là lý do duy nhất đủ mạnh để đi tới hybrid.
- Qdrant và pgvector cho **cùng thứ hạng** trên tập này (cùng vector, cùng khoảng cách cosine), nên chất lượng không phân biệt chúng.
  Khác biệt còn lại là vận hành: pgvector nằm trong Postgres (một dịch vụ ít hơn, ràng buộc quyền bằng `JOIN` được), Qdrant là thêm một
  dịch vụ. Với quy mô này pgvector đủ.
- **Không kết luận được gì về quy mô lớn.** 64 tài liệu, 16 truy vấn, một lần chạy, không có khoảng tin cậy; P@5 của truy vấn chính xác bị
  trần ở 0,2 vì chỉ có một tin đúng, nên đừng so cột đó. Độ trễ ở 64 vector không nói gì về triệu vector (HNSW, bộ nhớ chưa đo).
- Chưa đo: chi phí embed khi ghi (corpus 64 tin mất 1,5 s), lọc theo `serverId` kèm vector (quyền!), tiếng Việt thực tế.
