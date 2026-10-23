# ADR-0046: Chọn embedding cục bộ (ONNX) và LLM Groq free tier

Status: accepted — OWNER duyệt hướng `Embedder` port + embedding cục bộ ngày 2026-10-23; bảng số đo
dưới đây là kết quả T5.1, không đổi quyết định.
Date: 2026-10-23

## Context

- Plan T5.1 yêu cầu đánh giá ứng viên embedding + LLM trên tin nhắn demo tiếng Việt, đo recall@5,
  độ trễ, chi phí, điều khoản dữ liệu của free tier, rồi chốt bằng ADR.
- OWNER chốt dùng **Groq free tier** cho LLM (`openai/gpt-oss-20b`) và **không phát sinh chi phí**
  (ADR-0059). Groq không cung cấp endpoint embedding.
- Embedding dùng cho RAG/tìm kiếm ngữ nghĩa; nội dung là tin nhắn riêng của server nên ưu tiên
  xử lý cục bộ nếu chất lượng tiếng Việt đủ tốt.
- Mọi test tự động phải chạy bằng adapter giả (không gọi mạng, không tải model); chỉ một smoke call
  thủ công cho LLM.

## Candidates

| Ứng viên                                 | Loại   | Chi phí | Ghi chú                                                                 |
| ---------------------------------------- | ------ | ------- | ----------------------------------------------------------------------- |
| Groq embeddings                          | API    | —       | **Không tồn tại**: Groq chỉ có chat/audio, không có endpoint embedding. |
| `Xenova/multilingual-e5-small` (ONNX q8) | Cục bộ | 0       | Đa ngữ, 384 chiều, có tiền tố `query:`/`passage:`.                      |
| `Xenova/all-MiniLM-L6-v2` (ONNX q8)      | Cục bộ | 0       | Chủ yếu tiếng Anh; dùng làm mốc so sánh.                                |
| API embedding trả phí (OpenAI/Gemini)    | API    | > 0     | Vi phạm ràng buộc chi phí; chỉ xem lại nếu cục bộ không đạt.            |

## Measurements

Môi trường: Windows 11, Node v24.22.0, Intel64 Family 6 Model 141, chạy CPU. Bộ dữ liệu:
50 tin nhắn demo tiếng Việt / 5 channel, 25 truy vấn có paraphrase; không phải dữ liệu người dùng thật.
Script: `apps/api/scripts/eval-embeddings.ts`; số đo thô trong
`docs/v0.2.0/evidence/T5.1/embedding-eval.*.json`.

| Chỉ tiêu                     | e5-small đa ngữ       | all-MiniLM-L6-v2      | Baseline túi từ |
| ---------------------------- | --------------------- | --------------------- | --------------- |
| Số chiều                     | 384                   | 384                   | —               |
| Dung lượng model (q8)        | 129,1 MB              | 22,6 MB               | —               |
| Lần đầu (tải model + nạp)    | 9,4 s                 | 3,6 s                 | —               |
| Nạp lại khi đã cache         | 0,9 s                 | 3,0 s                 | —               |
| Embed 50 tin (batch, đã nạp) | 110 ms                | 70 ms                 | —               |
| Truy vấn p50 / p95           | 3,3 / 4,5 ms          | 1,7 / 2,8 ms          | < 1 ms          |
| RAM tiến trình sau nạp       | 519 MB (tăng ~312 MB) | 291 MB (tăng ~102 MB) | —               |
| recall@1                     | **0,96**              | 0,64                  | 0,80            |
| recall@5                     | **1,00**              | 0,80                  | 0,92            |
| MRR                          | **0,97**              | 0,73                  | 0,84            |
| Chi phí API                  | 0                     | 0                     | 0               |

LLM — một smoke call thủ công với `openai/gpt-oss-20b`:

| Chỉ tiêu                        | Kết quả                             |
| ------------------------------- | ----------------------------------- |
| Độ trễ                          | 551 ms                              |
| Token                           | 96 vào / 107 ra / 203 tổng          |
| Chi phí                         | 0 USD (free tier)                   |
| Hạn mức free tier (gpt-oss-20b) | 30 RPM, 1.000 RPD, 8K TPM, 200K TPD |

Nguồn hạn mức: <https://console.groq.com/docs/rate-limits>. Điều khoản dữ liệu: Groq **không lưu**
input/output mặc định; chỉ giữ tối đa 30 ngày khi xử lý sự cố/abuse, có thể bật Zero Data Retention;
dữ liệu (nếu có) nằm ở Mỹ — <https://console.groq.com/docs/your-data>. Vì vậy chỉ đưa tin nhắn demo
vào free tier trong T5.1; dữ liệu người dùng thật chỉ dùng khi có ZDR và OWNER duyệt.

## Decision

1. **Embedding**: dùng `Xenova/multilingual-e5-small` (ONNX q8) chạy cục bộ qua port `Embedder`;
   adapter thật `OnnxEmbedder`, adapter giả `FakeEmbedder` cho test. Tên model + số chiều được lưu
   kèm vector (`modelVersion`) để biết khi nào phải embed lại.
2. **LLM**: dùng Groq free tier qua port `LlmClient`; adapter thật `GroqLlmClient`
   (mặc định `openai/gpt-oss-20b`), adapter giả `FakeLlmClient` cho test. Thiếu `GROQ_API_KEY`
   → `AiUnavailableError`, tầng trên phải suy giảm chứ không chặn chat.
3. **Không hardcode nhà cung cấp**: đổi model/API chỉ sửa adapter hoặc biến môi trường
   `EMBEDDING_MODEL` / `GROQ_MODEL`.
4. **Qdrant** chạy Docker local (T5.2). Không dùng embedding API trả phí trong v0.2.0.
5. **Vector store (T5.2)**: mỗi cặp model + số chiều + phiên bản schema có collection riêng
   `messages__<model-slug>__<dimensions>__v<schema>`. Payload chỉ chứa
   `{serverId, channelId, authorId, createdAt, messageIds[], modelVersion}` — **không chứa nội dung
   tin nhắn**; nội dung luôn hydrate lại từ Postgres sau khi lọc quyền (T5.4). Qdrant chỉ publish
   trên loopback khi dev và không publish cổng ở production.

## Alternatives

- **all-MiniLM-L6-v2**: nhẹ hơn nhiều nhưng recall@5 chỉ 0,80 trên truy vấn tiếng Việt, thấp hơn cả
  baseline túi từ (0,92). Loại.
- **API embedding trả phí**: chất lượng tốt nhưng vi phạm ADR-0059; chỉ xem lại nếu T5.5 cho thấy
  e5-small không đủ trên corpus lớn hơn.
- **Nhét FastEmbed/Qdrant client thẳng vào logic RAG**: ít abstraction hơn nhưng trái quyết định
  port/adapter và khó thay model; đã loại ở ADR-0059.

## Consequences

- RAM API tăng đáng kể khi embedding được dùng lần đầu (~300 MB với e5-small). Model nạp lười nên
  API khởi động bình thường; production cần theo dõi RSS và có thể tách embedder khi index lớn.
- Lần đầu chạy cần tải ~129 MB từ Hugging Face; CI/test không tải model vì dùng adapter giả.
- Corpus đánh giá còn nhỏ nên recall@5 của e5 chạm trần (1,00); T5.5 phải đo lại trên seed lớn hơn
  và so sánh FTS vs hybrid trước khi chốt trọng số.
- `gpt-oss-20b` là model reasoning: đặt `max_tokens` quá thấp có thể chỉ trả về phần suy luận dở
  dang. Adapter không tự tăng trần; tầng gọi phải đặt đủ ngân sách token.
- Khoá Groq đã lộ trong lịch sử chat: phải xoay khoá sau khi xong thử nghiệm (ADR-0059).
