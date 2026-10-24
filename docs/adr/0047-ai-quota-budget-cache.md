# ADR-0047: Hạn mức, kill-switch ngân sách, cache và suy giảm cho AI

Status: accepted
Date: 2026-10-24

## Context

- T5.7 yêu cầu AI không được là điểm sập của sản phẩm: một user không thể đốt hết quota, một ngày
  không thể vượt trần chi phí, và khi LLM chết thì chat/search vẫn phải chạy bình thường.
- LLM đang dùng Groq free tier (`openai/gpt-oss-20b`, ADR-0046) nên giới hạn đến từ provider, không
  phải hoá đơn. Vẫn cần hạn mức theo user và trần chi phí theo ngày để (a) chia đều lượt dùng,
  (b) sẵn sàng cho provider trả phí mà không phải sửa kiến trúc.
- Redis đã là hạ tầng bắt buộc cho rate limit và cache ability; Postgres đã có sẵn để lưu dữ liệu
  bền. Chính sách Redis hiện tại là fail-open cho tính năng phụ (ADR-0026), nhưng chi phí AI không
  phải tính năng phụ.
- Câu hỏi lặp lại trên cùng ngữ cảnh là phổ biến; gọi LLM lại vừa chậm vừa tốn token. Cache phải
  gắn với đúng ngữ cảnh (server/channel/khoảng tin/model) để không trả câu trả lời của ngữ cảnh khác.
- Cần mã lỗi ổn định cho UI và test: hết lượt, hết ngân sách, AI không sẵn sàng.

## Decision

1. **Hạn mức theo user/ngày (UTC) — Redis, fail-closed**
   - Khoá `ai:quota:<YYYY-MM-DD>:<userId>`, tăng bằng `INCR` (nguyên tử), đặt TTL 2 ngày ở lần
     tăng đầu tiên để khoá của ngày cũ tự dọn.
   - Giữ quota **trước retrieval**: user đã hết lượt thì không đốt CPU embedding/Qdrant.
   - `used > AI_DAILY_REQUEST_LIMIT` (mặc định 50) → `AiQuotaExceededError` → SSE
     `AI_QUOTA_EXCEEDED`; không gọi embedder/vector store/LLM.
   - Redis không sẵn sàng hoặc lỗi lệnh → `AI_UNAVAILABLE` (fail-closed). Không thể kiểm soát chi
     phí thì không gọi AI; chat/search không dùng Redis này nên không bị ảnh hưởng.
   - Lượt hỏi trả lời từ cache **vẫn tính** vào quota (chống dùng cache làm cửa miễn phí); xem
     phần Giới hạn.

2. **Kill-switch ngân sách theo ngày — Postgres, fail-closed**
   - `AI_DAILY_BUDGET_USD > 0` là trần chi phí **toàn hệ thống** trong ngày UTC; `0` tắt kill-switch.
   - Tổng chi phí lấy từ `SUM(AiUsage.costUsd)` của đúng ngày UTC hiện tại. Dùng Postgres thay vì
     Redis vì đây là số liệu tiền, phải bền và không lệch khi Redis mất dữ liệu.
   - `spent >= AI_DAILY_BUDGET_USD` → `AiBudgetExhaustedError` → SSE `AI_BUDGET_EXHAUSTED`; không gọi
     LLM. Không đọc được chi phí → `AI_UNAVAILABLE` (fail-closed).
   - Cửa ngân sách đặt **sau cache**: khi đã hết tiền, câu trả lời có sẵn vẫn được phục vụ, nhưng
     không phát sinh lời gọi LLM mới.

3. **Ghi nhận token/chi phí — `AiUsage`**
   - Bảng `AiUsage` khoá duy nhất `(userId, day)` với `requests`, `promptTokens`, `completionTokens`,
     `costUsd` (`Decimal(12,6)`); mỗi lời gọi LLM `upsert` và `increment`.
   - Ghi **kể cả khi câu trả lời bị từ chối vì thiếu trích dẫn**: token đã tiêu thì phải hạch toán.
   - Lỗi ghi DB chỉ log cảnh báo, không làm hỏng câu trả lời (người dùng đã trả giá bằng thời gian).
   - Không lưu prompt, câu hỏi hay nội dung tin trong `AiUsage`.
   - Chi phí quy đổi từ token theo `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK`; free tier
     để `0` nên `costUsd = 0` (kill-switch chỉ kích hoạt khi cấu hình giá > 0 hoặc có nguồn chi phí khác).

4. **Cache câu trả lời — Redis, fail-open**
   - Khoá `ai:ask:<sha256>` trên chuỗi chuẩn hoá `serverId | channelId | messageIds đã sắp xếp |
model | phiên bản prompt | câu hỏi (trim, gộp khoảng trắng, lowercase)`. Khoá không chứa nội
     dung thô hay id tin, tránh lộ dữ liệu trong Redis.
   - TTL `AI_CACHE_TTL_SECONDS` (mặc định 3600); `0` tắt cache. Chỉ cache câu trả lời **đã qua kiểm
     trích dẫn**; payload hỏng/thiếu trường bị coi là trượt cache.
   - Redis chết/lỗi → coi như trượt cache, không chặn câu trả lời.
   - Cache hit phát `meta` với `cached: true`, `delta`, `done` như lượt gọi LLM để UI không cần nhánh riêng.
   - Đổi prompt/định dạng trả lời phải tăng `ASK_PROMPT_VERSION` để không trộn câu trả lời cũ.

5. **Timeout và retry có giới hạn — adapter Groq**
   - Mỗi lần thử có `AbortSignal.timeout(AI_LLM_TIMEOUT_MS)` (mặc định 20 s) để SSE không treo vô hạn.
   - Chỉ thử lại lỗi tạm thời: HTTP 429, 5xx, lỗi mạng/timeout. Tối đa `AI_LLM_MAX_RETRIES` (mặc định
     1. lần, backoff tuyến tính `AI_LLM_RETRY_BACKOFF_MS` (mặc định 300 ms).
   - 4xx khác (sai khoá, request hỏng) không thử lại. Mọi lỗi đổi thành `AiUnavailableError` với
     thông điệp không chứa body/khoá.

6. **Metrics (cổng riêng, ADR-0031)**
   - `ai_requests_total{outcome}` với tập hữu hạn: `ok`, `cache_hit`, `quota_exceeded`,
     `budget_exhausted`, `unavailable`, `invalid_question`, `insufficient_context`,
     `retrieval_failed`, `no_citation`.
   - `ai_tokens_total{kind="prompt"|"completion"}`, `ai_cost_usd_total`, `ai_llm_duration_seconds`.
   - Nhãn không chứa user id, câu hỏi hay nội dung tin (cardinality + riêng tư).

7. **Suy giảm**
   - Mọi lỗi AI chỉ ảnh hưởng endpoint `/ask`; gửi/đọc tin, tìm kiếm và các tính năng chat khác
     không phụ thuộc LLM/Redis quota.
   - UI map mã lỗi sang i18n và giữ dialog mở để người dùng thử lại.

## Reason

- Redis `INCR` là cách rẻ và nguyên tử nhất để đếm lượt theo ngày; TTL tự dọn, không cần job.
- Tiền phải nằm ở Postgres: Redis mất dữ liệu sẽ làm kill-switch mất tác dụng đúng lúc cần nhất.
- Đặt quota trước retrieval và ngân sách sau cache tối ưu cả chi phí lẫn trải nghiệm: không đốt
  embedding khi hết lượt, vẫn trả được câu trả lời cũ khi hết tiền.
- Cache theo đúng ngữ cảnh + phiên bản prompt tránh trả lời sai ngữ cảnh hoặc trộn prompt cũ/mới.
- Retry chỉ cho lỗi tạm thời, có timeout và trần số lần, tránh vừa treo request vừa nhân đôi chi phí.

## Alternatives

- **Đếm quota trong Postgres.** Bị từ chối: mỗi lượt hỏi thành một giao dịch ghi có tranh chấp
  trên cùng một dòng, chậm hơn Redis và không cần độ bền tuyệt đối cho bộ đếm trong ngày.
- **Kill-switch ngân sách bằng Redis.** Bị từ chối: mất Redis hoặc eviction sẽ vô hiệu hoá trần chi
  phí; số liệu tiền cần bền và truy vết được.
- **Không tính cache hit vào quota.** Bị từ chối: người dùng có thể lặp câu hỏi để dùng miễn phí
  không giới hạn, trong khi mục tiêu của quota là chia đều lượt tương tác.
- **Chặn ngân sách trước cache.** Bị từ chối: đã hết tiền thì câu trả lời có sẵn vẫn là giá trị đã
  trả; chặn sẽ làm giảm ích lợi mà không tiết kiệm thêm đồng nào.
- **Retry vô hạn hoặc chỉ dựa vào timeout của client.** Bị từ chối: giữ kết nối SSE và có thể nhân
  đôi chi phí; timeout/retry phải nằm ở adapter có ngân sách.
- **Chỉ có quota toàn hệ thống.** Bị từ chối: một user có thể chiếm hết lượt của mọi người.

## Consequences

- **Tích cực:** chi phí bị chặn ở hai lớp; lỗi có mã ổn định và test được; cache giảm độ trễ (đo
  được 1860 ms → 32 ms trong drill) và giảm token; AI chết không kéo chat/search xuống.
- **Giới hạn đã biết:**
  - Cache hit vẫn tính quota (có chủ đích) nên quota là "số lượt hỏi", không phải "số lời gọi LLM".
  - Hai request đồng thời có thể cùng qua cửa ngân sách trước khi bản ghi chi phí đầu tiên được
    ghi, nên trần có thể vượt rất nhẹ. Chấp nhận ở quy mô hiện tại; nếu cần chính xác tuyệt đối phải
    thêm khoá/đặt trước ngân sách.
  - Cache có thể cũ tối đa bằng TTL; tin mới/xoá tin chưa phản ánh ngay trong câu trả lời cache.
  - Free tier để giá token `0` nên `ai_cost_usd_total = 0` và kill-switch không kích hoạt cho đến khi
    cấu hình giá thực.
  - Redis chết làm AI từ chối (fail-closed) — đúng chủ đích, nhưng là một phụ thuộc mới của `/ask`.
- **Vận hành:** thêm biến môi trường trong `.env.example`; cần theo dõi `ai_requests_total{outcome}`,
  `ai_tokens_total`, `ai_cost_usd_total`; khi đổi prompt phải tăng `ASK_PROMPT_VERSION`.
- **Không đổi:** schema Qdrant/collection, hợp đồng SSE (`meta/delta/done/error`), quyền truy cập
  (ADR-0048). Chỉ thêm bảng `AiUsage`, service usage/cache và metric.

## References

- Kế hoạch: `docs/ping-v0.2.0-plan.md` (T5.7, T5.11).
- [ADR-0026](0026-failure-modes-and-graceful-shutdown.md): chính sách fail-open/fail-closed của Redis.
- [ADR-0031](0031-observability.md): metrics ở cổng riêng, nhãn không chứa URL thật.
- [ADR-0046](0046-embedding-and-llm-provider.md): lựa chọn embedding/LLM và free tier.
- [ADR-0048](0048-controlled-vector-retrieval.md): truy xuất có kiểm soát quyền trước khi vào prompt.
- Bằng chứng: `docs/v0.2.0/evidence/T5.7/README.md`.
