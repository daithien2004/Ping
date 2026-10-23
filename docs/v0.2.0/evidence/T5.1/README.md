# Bằng chứng T5.1 — Đánh giá embedding + LLM, chốt ADR-0046

## Phạm vi

- So sánh embedding cục bộ đa ngữ (`Xenova/multilingual-e5-small`) với baseline tiếng Anh
  (`Xenova/all-MiniLM-L6-v2`) và baseline túi từ trên 50 tin nhắn demo tiếng Việt / 25 truy vấn.
- Đo recall@1, recall@5, MRR, độ trễ, RAM, dung lượng model, thời gian nạp.
- Một smoke call thủ công tới Groq `openai/gpt-oss-20b`; kiểm tra hạn mức + điều khoản dữ liệu free tier.
- Tạo port `Embedder` / `LlmClient` với adapter thật + adapter giả cho test.
- Chốt [ADR-0046](../../../adr/0046-embedding-and-llm-provider.md).

## Tệp chính

- `docs/adr/0046-embedding-and-llm-provider.md`
- `apps/api/src/modules/ai/`
  - `embedder.port.ts`, `onnx-embedder.ts`, `fake-embedder.ts`
  - `llm-client.port.ts`, `groq-llm.client.ts`, `fake-llm.client.ts`
  - `ai.module.ts` (đăng ký port, chưa nối vào RAG)
- `apps/api/test/ai/embedding-dataset.json` (50 tin, 25 truy vấn)
- `apps/api/scripts/eval-embeddings.ts`, `apps/api/scripts/smoke-llm.ts`
- `docker-compose.yml` thêm Qdrant local (chuẩn bị T5.2), `.env.example` thêm `QDRANT_URL`

## Cách chạy lại

```bash
# Một model mỗi lần để số đo RAM không bị ảnh hưởng bởi model trước
pnpm --filter api exec tsx scripts/eval-embeddings.ts --model Xenova/multilingual-e5-small
pnpm --filter api exec tsx scripts/eval-embeddings.ts --model Xenova/all-MiniLM-L6-v2

# Smoke LLM (cần GROQ_API_KEY trong .env; không in khoá)
pnpm --filter api exec tsx scripts/smoke-llm.ts
```

Kết quả thô: `embedding-eval.*.json` trong thư mục này. File `.cold.json` chạy với cache rỗng
(có tải model); file không hậu tố chạy lại khi model đã cache.

## Kết quả

Môi trường: Windows 11, Node v24.22.0, Intel64 Family 6 Model 141, CPU.

| Chỉ tiêu               | e5-small đa ngữ | all-MiniLM-L6-v2 | Baseline túi từ |
| ---------------------- | --------------- | ---------------- | --------------- |
| Số chiều               | 384             | 384              | —               |
| Dung lượng model (q8)  | 129,1 MB        | 22,6 MB          | —               |
| Lần đầu (tải + nạp)    | 9,4 s           | 3,6 s            | —               |
| Nạp lại khi đã cache   | 0,9 s           | 3,0 s            | —               |
| Embed 50 tin (batch)   | 110 ms          | 70 ms            | —               |
| Truy vấn p50 / p95     | 3,3 / 4,5 ms    | 1,7 / 2,8 ms     | < 1 ms          |
| RAM tiến trình sau nạp | 519 MB          | 291 MB           | —               |
| recall@1               | **0,96**        | 0,64             | 0,80            |
| recall@5               | **1,00**        | 0,80             | 0,92            |
| MRR                    | **0,97**        | 0,73             | 0,84            |

LLM smoke call: 551 ms, 96 token vào / 107 ra / 203 tổng, chi phí 0 USD.
Hạn mức free tier `gpt-oss-20b`: 30 RPM, 1.000 RPD, 8K TPM, 200K TPD
(<https://console.groq.com/docs/rate-limits>).

Điều khoản dữ liệu: Groq không lưu input/output mặc định; tối đa 30 ngày khi xử lý sự cố/abuse;
có Zero Data Retention; dữ liệu (nếu có) ở Mỹ
(<https://console.groq.com/docs/your-data>). T5.1 chỉ gửi tin nhắn demo; dữ liệu thật cần ZDR +
OWNER duyệt.

## Hạn chế

- Bộ dữ liệu nhỏ, tổng hợp, do người viết tự tạo; recall@5 của e5 chạm trần 1,00 nên chưa chứng minh
  được lợi thế trên corpus lớn. T5.5 phải đo lại FTS vs hybrid trên seed lớn hơn.
- Baseline "túi từ" chỉ để tham chiếu, không phải Postgres FTS của sản phẩm.
- Số đo RAM là RSS của cả tiến trình Node/tsx, không tách riêng ONNX runtime.
- `gpt-oss-20b` là model reasoning: `max_tokens` thấp có thể trả về phần suy luận dở dang (lần smoke
  đầu với 80 token bị cắt; lần chạy 256 token trả đủ câu).

## Kiểm tra

- `pnpm --filter api typecheck`
- `pnpm --filter api test` (gồm 9 test mới cho AI)
- `pnpm --filter api lint`
- `pnpm format:check`
- `pnpm docs:check`
