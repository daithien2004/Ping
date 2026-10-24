# Bằng chứng T5.7 — Hạn mức, kill-switch ngân sách, cache, timeout/retry và metrics AI

Base: `481b8d7` (merge T5.6). Nhánh: `feat/t5.7-ai-budget`. Bằng chứng nằm trong cùng commit với code.
Thiết kế: [ADR-0047](../../../adr/0047-ai-quota-budget-cache.md).

## Phạm vi

- `apps/api/src/modules/ai/usage/ai-usage.service.ts`: quota user/ngày (Redis `INCR` +
  TTL 2 ngày), kill-switch ngân sách ngày (tổng `AiUsage.costUsd` trong Postgres), ghi token/chi
  phí, quy đổi giá theo triệu token. Lỗi Redis/Postgres ở cửa kiểm soát → `AI_UNAVAILABLE`
  (fail-closed).
- `apps/api/prisma/schema.prisma` + `migrations/20261024032431_add_ai_usage/`: bảng `AiUsage`
  (`userId`, `day`, `requests`, `promptTokens`, `completionTokens`, `costUsd Decimal(12,6)`,
  unique `(userId, day)`).
- `apps/api/src/modules/ai/cache/ask-cache.service.ts`: cache Redis theo
  `sha256(serverId | channelId | messageIds đã sắp xếp | model | ASK_PROMPT_VERSION | câu hỏi
chuẩn hoá)`, TTL `AI_CACHE_TTL_SECONDS`, chỉ lưu câu trả lời đã qua kiểm trích dẫn, fail-open.
- `apps/api/src/modules/ai/ask/ask.service.ts`: thứ tự quota → retrieval → cache → ngân sách → LLM
  → ghi usage/metrics; `meta.cached`; mã lỗi `AI_QUOTA_EXCEEDED`, `AI_BUDGET_EXHAUSTED`,
  `AI_UNAVAILABLE`; ghi token kể cả khi bị từ chối vì thiếu trích dẫn.
- `apps/api/src/modules/ai/groq-llm.client.ts`: timeout từng lần thử (`AbortSignal.timeout`), retry
  có giới hạn cho 429/5xx/lỗi mạng, backoff tuyến tính; 4xx khác không retry.
- `apps/api/src/infra/metrics/metrics.service.ts`: `ai_requests_total{outcome}`,
  `ai_tokens_total{kind}`, `ai_cost_usd_total`, `ai_llm_duration_seconds`.
- `apps/api/src/config/env.schema.ts` + `.env.example`: `AI_DAILY_REQUEST_LIMIT`,
  `AI_DAILY_BUDGET_USD`, `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`,
  `AI_CACHE_TTL_SECONDS`, `AI_LLM_TIMEOUT_MS`, `AI_LLM_MAX_RETRIES`, `AI_LLM_RETRY_BACKOFF_MS`.
- Web: `apps/web/src/features/messages/components/ask-dialog.tsx` map mã lỗi mới sang i18n;
  `apps/web/messages/{vi,en}.json` thêm chuỗi tương ứng (không dùng cast `t`).
- Test: `ask.service.spec.ts` (quota/budget/cache/usage/metrics), `ai-usage.service.spec.ts`,
  `ask-cache.service.spec.ts`, `groq-llm.client.spec.ts` (retry/timeout); e2e `ask.e2e-spec.ts`
  thêm quota, budget, cache hit và suy giảm khi LLM chết.

## Kết quả kiểm tra tự động

Môi trường: Windows, Node 22, Docker Desktop; Postgres/Redis/Qdrant healthy; e2e dùng Postgres +
Redis thật, LLM/embedding/vector store giả qua DI (không gọi Groq, không cần key).

| Tiêu chí              | Lệnh                                                                                     | Kết quả                             | Ghi chú                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| API typecheck         | `pnpm --filter api typecheck`                                                            | pass                                |                                                           |
| API lint              | `pnpm --filter api lint`                                                                 | pass                                |                                                           |
| Unit API              | `pnpm --filter api test`                                                                 | pass — 21 file / 129 test           | gồm 8 test quota/budget/cache trong `ask.service.spec.ts` |
| Web typecheck         | `pnpm --filter web typecheck`                                                            | pass                                |                                                           |
| Web lint              | `pnpm --filter web lint`                                                                 | pass                                |                                                           |
| Unit web              | `pnpm --filter web test`                                                                 | pass — 20 file / 117 test           | i18n vi/en khớp khoá                                      |
| Build web             | `pnpm --filter web build`                                                                | pass                                |                                                           |
| Ngân sách bundle      | `pnpm --filter web check:bundle`                                                         | pass — JS tải ban đầu 243,7 KB gzip | ngưỡng 450 KB                                             |
| Format                | `pnpm format:check`                                                                      | pass                                |                                                           |
| Liên kết tài liệu     | `pnpm docs:check`                                                                        | pass                                |                                                           |
| E2E `ask.e2e-spec.ts` | `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/ask.e2e-spec.ts` | **pass 8/8**                        | quota, budget, cache, AI chết nhưng chat vẫn chạy         |

Các test e2e mới:

1. Hết hạn mức: đặt `ai:quota:<ngày>:<user>` = `AI_DAILY_REQUEST_LIMIT` → SSE `error`
   `AI_QUOTA_EXCEEDED`, LLM không được gọi.
2. Chạm trần ngân sách: seed `AiUsage.costUsd = 999999` cho ngày UTC → `AI_BUDGET_EXHAUSTED`,
   LLM không được gọi; test tự xoá bản ghi để không chặn các ca sau.
3. Cache: hỏi cùng câu hai lần → LLM chỉ gọi 1 lần, lần hai `meta.cached = true`, vẫn có `done`.
4. Suy giảm: LLM ném lỗi → `/ask` trả `AI_UNAVAILABLE`; `POST` và `GET` tin nhắn vẫn `201`/`200`.

`beforeEach` gọi `flushdb()` để reset rate limit đăng ký (5/phút/IP), quota và cache giữa các ca.

## Drill thủ công trên API thật

Seed `alice@ping.dev`; server `Ping Playground` (`01990000-0000-7000-8000-000000000100`), kênh
`general` (`...0401`). API chạy `PORT=4000`, `METRICS_PORT=9464`, `AI_INDEXER_ENABLED=false`;
embedding + Qdrant local thật, LLM Groq thật ở ca cache; ca suy giảm chạy API thứ hai ở cổng 4001
với `GROQ_API_KEY=gsk-invalid`.

| Kịch bản                     | Cách làm                                                         | Kết quả đo                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache miss → hit             | Hỏi “Kênh nào dành cho thảo luận kỹ thuật?” hai lần              | Lần 1: 1860 ms, `meta` không có `cached`; lần 2: **32 ms**, `meta.cached = true`; cùng câu trả lời và trích dẫn `01990000-0000-7000-8000-000000000504`                                                                                                                 |
| Vượt quota                   | `SET ai:quota:<ngày UTC>:<alice> 50` (limit mặc định 50) rồi hỏi | SSE `error` `AI_QUOTA_EXCEEDED`, “Đã dùng hết 50 lượt hỏi AI hôm nay.”                                                                                                                                                                                                 |
| Vượt ngân sách               | `AiUsage.costUsd = 999999` cho ngày UTC rồi hỏi                  | SSE `error` `AI_BUDGET_EXHAUSTED`, không gọi LLM                                                                                                                                                                                                                       |
| Ngân sách hết nhưng có cache | Giữ bản ghi chi phí, hỏi lại đúng câu đã cache                   | Trả câu trả lời cache (`meta.cached = true`), không gọi LLM — đúng thứ tự cache trước kill-switch                                                                                                                                                                      |
| AI chết                      | API 4001 với `GROQ_API_KEY=gsk-invalid`                          | `/ask` → `meta` + `error` `AI_UNAVAILABLE` (“Groq trả về HTTP 401”); gửi tin `POST` = **201**, đọc tin `GET` = **200**, tin vừa gửi có trong trang                                                                                                                     |
| Metrics                      | `GET http://127.0.0.1:9464/metrics` sau chuỗi drill              | `ai_requests_total{outcome="ok"} 1`, `{outcome="cache_hit"} 1`, `{outcome="quota_exceeded"} 1`, `{outcome="budget_exhausted"} 1`; `ai_tokens_total{kind="prompt"} 495`, `{kind="completion"} 90`; `ai_cost_usd_total 0` (free tier); `ai_llm_duration_seconds_count 1` |

Dọn sau drill: xoá `ai:ask:*`, xoá khoá quota, xoá `AiUsage` của alice, dừng API 4000/4001.
Không có key Groq nào bị in ra log hay commit.

## Giới hạn

- Cache hit **vẫn tính** vào quota (chủ đích, chống lạm dụng cache); quota là số lượt hỏi, không
  phải số lời gọi LLM.
- Kill-switch đọc tổng chi phí trước khi gọi LLM; hai request đồng thời có thể cùng qua cửa trước
  khi bản ghi đầu tiên được ghi nên trần có thể vượt rất nhẹ. Chấp nhận ở quy mô hiện tại.
- Cache có thể cũ tối đa bằng `AI_CACHE_TTL_SECONDS` (mặc định 1 giờ); tin mới/xoá tin chưa phản
  ánh ngay trong câu trả lời cache.
- Free tier để giá token `0` nên `ai_cost_usd_total = 0` và kill-switch chỉ kích hoạt khi cấu hình
  `AI_PRICE_*` > 0 (hoặc có nguồn chi phí khác). Drill ngân sách vì vậy seed `AiUsage` trực tiếp.
- Redis chết làm `/ask` từ chối (`AI_UNAVAILABLE`) — fail-closed có chủ đích; chat/search không phụ
  thuộc đường này.
- Chưa có rate limit riêng cho endpoint AI (T6.5) và chưa có alert ngân sách > 80% (T5.11).

## Cách chạy lại

1. `docker compose up -d postgres redis qdrant`; `pnpm --filter api exec prisma migrate deploy`.
2. `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/ask.e2e-spec.ts`.
3. Drill: `pnpm --filter api dev` (cổng 4000, `METRICS_PORT=9464`), đăng nhập alice, hỏi một câu
   hai lần để thấy `cached`; đặt khoá quota/seed `AiUsage` như bảng trên; chạy thêm một API với
   `GROQ_API_KEY` sai để kiểm tra suy giảm; đọc `/metrics` ở cổng 9464.
