# Bằng chứng T5.6 — Hỏi AI về lịch sử kênh (RAG + SSE)

Base: `3f2f071` (merge T5.4). Nhánh: `feat/t5.6-ask`. Bằng chứng nằm trong cùng commit với code.

## Phạm vi

- `apps/api/src/modules/ai/ask/ask.service.ts`: truy xuất → prompt → LLM → sự kiện SSE.
  - Khử trùng tin giữa các chunk chồng lấn, xếp theo `createdAt` rồi mới lấy tối đa
    `MAX_CONTEXT_MESSAGES = 8` tin mới nhất (`limit` của retrieval đếm theo chunk nên phải cắt lại
    theo số tin).
  - Tin trong `<context>` được **thoát XML**; system prompt nói rõ nội dung tin là dữ liệu,
    không phải chỉ thị (giảm thiểu prompt injection) và trả lời cùng ngôn ngữ với câu hỏi.
  - **Trích dẫn bắt buộc**: chỉ id UUID nằm trong ngữ cảnh mới được chấp nhận; không có trích dẫn
    hợp lệ → `AI_NO_CITATION`, không phát `delta`/`done` (fail-closed).
  - Không đủ ngữ cảnh → `AI_INSUFFICIENT_CONTEXT`; LLM lỗi → `AI_UNAVAILABLE`; retrieval lỗi →
    `AI_RETRIEVAL_FAILED`; câu hỏi rỗng/quá dài → `AI_INVALID_QUESTION`.
- `apps/api/src/modules/ai/ask/ask.controller.ts`: `POST /servers/:serverId/ask`, `text/event-stream`,
  `JwtAuthGuard` + `AbilityGuard` (`view Message`) + `AskService.authorize()` kiểm membership tươi;
  ngừng ghi khi client đóng kết nối (`response.destroyed`).
- `apps/api/src/modules/ai/ai.module.ts`: đăng ký `AskController`/`AskService`, import `AuthModule`.
- `apps/api/src/modules/ai/fake-llm.client.ts`: adapter giả tự thêm trích dẫn từ `<context>` để test
  không phải hard-code id (nhận UUID chuẩn, kể cả `uuid(7)` của Prisma).
- `apps/api/src/modules/ai/ask/ask.service.spec.ts`: 11 unit test (không cần Docker).
- `apps/api/test/ask.e2e-spec.ts`: 4 e2e (thành viên, người ngoài 403, thiếu ngữ cảnh, injection).
- `apps/api/test/idor.e2e-spec.ts`: thêm `['post', '/servers/:id/ask']` (22 route).
- Web:
  - `apps/web/src/lib/api-client.ts`: thêm `api.stream()` — dùng lại Bearer token, cookie, refresh
    401 và `ApiError`, trả `Response` chưa đọc để đọc SSE (không tự viết lại fetch).
  - `apps/web/src/features/messages/components/ask-dialog.tsx`: dialog hỏi AI, đọc SSE, hiện câu trả
    lời **văn bản thuần** (`whitespace-pre-wrap`, không Markdown/HTML), chip trích dẫn, hủy giữa
    chừng (AbortController), map mã lỗi SSE sang i18n. Khung “Đang hỏi…” là `<div>` vì spinner là
    `<div>` (trước đó là `<p>` gây hydration error, phát hiện khi chụp ảnh).
  - `apps/web/src/features/channels/components/channel-view.tsx`: nút Hỏi trong header; chip trích
    dẫn điều hướng `?m=<messageId>`.
  - `apps/web/src/features/messages/components/message-pane.tsx` + `message-item.tsx`: đọc `?m=`,
    cuộn tới tin (tải thêm tối đa 5 trang cũ), tô sáng tin đích.
  - `apps/web/src/app/(app)/servers/[serverId]/channels/[channelId]/page.tsx`: truyền `searchParams`
    của chính trang (không dùng `useSearchParams` trong trang bị `<Activity>` ẩn).
  - `apps/web/messages/{vi,en}.json`: namespace `ask` (13 khoá, ngang nhau).
- `apps/web/src/lib/api-client.test.ts`: 3 test cho `api.stream` (Bearer/header, refresh 401, lỗi HTTP).

## Kết quả

Môi trường: Windows, Node 22, Docker Desktop; Postgres/Redis/Qdrant (`qdrant/qdrant:v1.12.4`) healthy;
API dùng `QDRANT_URL=http://localhost:6333`, embedding `xenova/multilingual-e5-small` (384 chiều),
LLM thật `openai/gpt-oss-20b` qua Groq free tier (key chỉ nằm trong `.env`, không commit).

| Tiêu chí                                               | Lệnh/cách thử                                                                             | Kết quả                             | Ghi chú / file                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| API typecheck                                          | `pnpm --filter api typecheck`                                                             | pass                                |                                                                             |
| API lint                                               | `pnpm --filter api lint`                                                                  | pass                                |                                                                             |
| Unit API                                               | `pnpm --filter api test`                                                                  | pass — 19 file / 81 test            | 11 test `AskService`                                                        |
| Web typecheck                                          | `pnpm --filter web typecheck`                                                             | pass                                |                                                                             |
| Web lint                                               | `pnpm --filter web lint`                                                                  | pass                                |                                                                             |
| Unit web                                               | `pnpm --filter web test`                                                                  | pass — 20 file / 117 test           | 3 test `api.stream`                                                         |
| Build web                                              | `pnpm --filter web build`                                                                 | pass                                |                                                                             |
| Ngân sách bundle                                       | `pnpm --filter web check:bundle`                                                          | pass — JS tải ban đầu 243,7 KB gzip | ngưỡng 450 KB                                                               |
| Format                                                 | `pnpm format:check`                                                                       | pass                                |                                                                             |
| Liên kết tài liệu                                      | `pnpm docs:check`                                                                         | pass                                |                                                                             |
| SSE trả `meta → delta → done` + trích dẫn              | `ask.service.spec.ts`                                                                     | pass                                | id ngoài ngữ cảnh bị bỏ                                                     |
| Khử trùng tin giữa chunk chồng lấn                     | `ask.service.spec.ts`                                                                     | pass                                | `messageCount` đếm tin duy nhất, xếp theo thời gian                         |
| Không đủ ngữ cảnh bị từ chối                           | `ask.service.spec.ts`                                                                     | pass                                | `AI_INSUFFICIENT_CONTEXT`, không gọi LLM                                    |
| Giảm thiểu prompt injection (thoát XML + tách chỉ thị) | `ask.service.spec.ts`                                                                     | pass                                | dữ liệu không đóng được `</context>`; không chứng minh miễn nhiễm hoàn toàn |
| E2E `ask.e2e-spec.ts` (4 test)                         | `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/ask.e2e-spec.ts`  | **pass 4/4** (4,77 s)               | Postgres + Redis thật, Qdrant/LLM/embedding giả qua DI                      |
| IDOR có route `POST /servers/:id/ask`                  | `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/idor.e2e-spec.ts` | **pass 5/5** (8,11 s)               | 22 route, gồm `/servers/:id/ask`                                            |
| Hủy yêu cầu từ client                                  | thao tác tay trên UI + đọc code                                                           | pass                                | `AbortController` + `api.stream(..., { signal })`; xem “Giới hạn”           |
| Chip trích dẫn nhảy tới tin gốc                        | thao tác tay trên UI, ảnh chụp                                                            | **pass**                            | `ask-answer-citations.png`, `citation-jump-highlight.png`                   |
| Trả lời thật từ Groq + trích dẫn đúng                  | `POST /servers/:id/ask` trên dữ liệu seed                                                 | pass                                | 2 trích dẫn đúng tin “release 05/11/2026” và “Minh phụ trách RAG”           |

### Ảnh chụp

1. `ask-answer-citations.png` — dialog **Hỏi AI về lịch sử kênh** với câu trả lời văn bản thuần và
   hai chip nguồn (`01a16bdf…`), sau khi gọi Groq thật qua SSE.
2. `citation-jump-highlight.png` — sau khi bấm chip, URL thành `?m=<messageId>`, dialog đóng, danh
   sách cuộn tới và tô sáng đúng tin “Mốc release dự kiến 05/11/2026…”.

## Giới hạn

- SSE hiện phát một `delta` chứa toàn bộ câu trả lời (LLM client chưa stream token); giao thức và UI
  đã sẵn sàng cho nhiều `delta`.
- Hủy phía client dừng vòng ghi SSE và không ghi tiếp vào socket đã đóng; lời gọi LLM đang chạy
  vẫn hoàn tất vì `LlmClient` chưa nhận `AbortSignal` (để T5.7 cùng timeout/retry). Chưa có browser
  test tự động cho thao tác hủy — mới kiểm bằng code + thao tác tay.
- Chưa có hạn mức/ngân sách/retry cho endpoint này (T5.7) và chưa có rate limit riêng (T6.5);
  `GroqLlmClient` đã có timeout 20 s và lỗi mạng/HTTP thành `AI_UNAVAILABLE`.
- Test prompt injection chỉ chứng minh dữ liệu không thể đóng thẻ `</context>` và system prompt tách
  chỉ thị/dữ liệu; không chứng minh miễn nhiễm hoàn toàn (T5.9 mới có bộ đánh giá).
- Qdrant local còn point của các lần chạy trước; bằng chứng UI dùng server/kênh seed riêng
  (`Ping Demo` / `ke-hoach-v020`) nên không lẫn dữ liệu cũ.

## Cách chạy lại

1. `docker compose up -d postgres redis qdrant` (cần `QDRANT_URL=http://localhost:6333` trong `.env`).
2. `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/ask.e2e-spec.ts test/idor.e2e-spec.ts`
3. `pnpm --filter api dev` + `pnpm --filter web dev`; đăng ký/đăng nhập, tạo server + kênh, gửi vài
   tin, đợi indexer (log không còn “consumer indexer tắt”), bấm **Hỏi**, hỏi một câu, bấm chip trích
   dẫn để kiểm tra nhảy tới tin gốc.
