# Bằng chứng T5.6 — Hỏi AI về lịch sử kênh (RAG + SSE)

Base: `3f2f071` (merge T5.4). Nhánh: `feat/t5.6-ask`. Bằng chứng nằm trong cùng commit với code.

## Phạm vi

- `apps/api/src/modules/ai/ask/ask.service.ts`: truy xuất → prompt → LLM → sự kiện SSE.
  - Tối đa `MAX_CONTEXT_MESSAGES = 8` tin gần nhất trong prompt (`limit` của retrieval đếm theo
    chunk nên phải cắt lại theo số tin).
  - Tin trong `<context>` được **thoát XML**; system prompt nói rõ nội dung tin là dữ liệu,
    không phải chỉ thị (chống prompt injection).
  - **Trích dẫn bắt buộc**: chỉ id UUID nằm trong ngữ cảnh mới được chấp nhận; không có trích dẫn
    hợp lệ → `AI_NO_CITATION`, không phát `delta`/`done` (fail-closed).
  - Không đủ ngữ cảnh → `AI_INSUFFICIENT_CONTEXT`; LLM lỗi → `AI_UNAVAILABLE`; retrieval lỗi →
    `AI_RETRIEVAL_FAILED`; câu hỏi rỗng/quá dài → `AI_INVALID_QUESTION`.
- `apps/api/src/modules/ai/ask/ask.controller.ts`: `POST /servers/:serverId/ask`, `text/event-stream`,
  `JwtAuthGuard` + `AbilityGuard` (`view Message`) + `AskService.authorize()` kiểm membership tươi.
- `apps/api/src/modules/ai/ai.module.ts`: đăng ký `AskController`/`AskService`, import `AuthModule`.
- `apps/api/src/modules/ai/fake-llm.client.ts`: adapter giả tự thêm trích dẫn từ `<context>` để test
  không phải hard-code id.
- `apps/api/src/modules/ai/ask/ask.service.spec.ts`: 10 unit test (không cần Docker).
- `apps/api/test/ask.e2e-spec.ts`: 4 e2e (thành viên, người ngoài 403, thiếu ngữ cảnh, injection).
- `apps/api/test/idor.e2e-spec.ts`: thêm `['post', '/servers/:id/ask']` (22 route).
- Web:
  - `apps/web/src/lib/api-client.ts`: thêm `api.stream()` — dùng lại Bearer token, cookie, refresh
    401 và `ApiError`, trả `Response` chưa đọc để đọc SSE (không tự viết lại fetch).
  - `apps/web/src/features/messages/components/ask-dialog.tsx`: dialog hỏi AI, đọc SSE, hiện câu trả
    lời **văn bản thuần** (`whitespace-pre-wrap`, không Markdown/HTML), chip trích dẫn, hủy giữa
    chừng (AbortController), map mã lỗi SSE sang i18n.
  - `apps/web/src/features/channels/components/channel-view.tsx`: nút Hỏi trong header; chip trích
    dẫn điều hướng `?m=<messageId>`.
  - `apps/web/src/features/messages/components/message-pane.tsx` + `message-item.tsx`: đọc `?m=`,
    cuộn tới tin (tải thêm tối đa 5 trang cũ), tô sáng tin đích.
  - `apps/web/src/app/(app)/servers/[serverId]/channels/[channelId]/page.tsx`: truyền `searchParams`
    của chính trang (không dùng `useSearchParams` trong trang bị `<Activity>` ẩn).
  - `apps/web/messages/{vi,en}.json`: namespace `ask` (13 khoá, ngang nhau).
- `apps/web/src/lib/api-client.test.ts`: 3 test cho `api.stream` (Bearer/header, refresh 401, lỗi HTTP).

## Kết quả

| Tiêu chí                                               | Lệnh/cách thử                                                                            | Kết quả                             | Ghi chú                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| API typecheck                                          | `pnpm --filter api typecheck`                                                            | pass                                |                                                                                  |
| API lint                                               | `pnpm --filter api lint`                                                                 | pass                                |                                                                                  |
| Unit API                                               | `pnpm --filter api test`                                                                 | pass — 19 file / 80 test            | thêm 10 test `AskService`                                                        |
| Web typecheck                                          | `pnpm --filter web typecheck`                                                            | pass                                |                                                                                  |
| Web lint                                               | `pnpm --filter web lint`                                                                 | pass                                |                                                                                  |
| Unit web                                               | `pnpm --filter web test`                                                                 | pass — 20 file / 117 test           | thêm 3 test `api.stream`                                                         |
| Build web                                              | `pnpm --filter web build`                                                                | pass                                |                                                                                  |
| Ngân sách bundle                                       | `pnpm --filter web check:bundle`                                                         | pass — JS tải ban đầu 243,7 KB gzip | ngưỡng 450 KB                                                                    |
| Format                                                 | `pnpm format:check`                                                                      | pass                                |                                                                                  |
| Liên kết tài liệu                                      | `pnpm docs:check`                                                                        | pass                                |                                                                                  |
| SSE trả `meta → delta → done` + trích dẫn              | `ask.service.spec.ts`                                                                    | pass                                | id ngoài ngữ cảnh bị bỏ                                                          |
| Không đủ ngữ cảnh bị từ chối                           | `ask.service.spec.ts`                                                                    | pass                                | `AI_INSUFFICIENT_CONTEXT`, không gọi LLM                                         |
| Giảm thiểu prompt injection (thoát XML + tách chỉ thị) | `ask.service.spec.ts`                                                                    | pass                                | dữ liệu không đóng được `</context>`; không chứng minh miễn nhiễm hoàn toàn      |
| E2E `ask.e2e-spec.ts` (4 test)                         | `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/ask.e2e-spec.ts` | **not-run**                         | Docker Desktop service `Stopped`, không có Postgres/Redis/Qdrant; xem “Giới hạn” |
| IDOR có route `POST /servers/:id/ask`                  | `test/idor.e2e-spec.ts`                                                                  | **not-run**                         | đã thêm route + nâng số kỳ vọng 21 → 22, chưa chạy lại được                      |
| Hủy yêu cầu từ client                                  | thao tác tay/e2e                                                                         | **not-run**                         | logic `AbortController` có trong `ask-dialog.tsx`; chưa có browser test          |
| Chip trích dẫn nhảy tới tin gốc                        | thao tác tay/e2e + ảnh                                                                   | **not-run**                         | cùng lý do Docker                                                                |

## Giới hạn

- Không chạy được e2e và không chụp ảnh UI trong lần này: `com.docker.service` đang `Stopped` và
  tài khoản hiện tại không có quyền khởi động; cổng 5432/6379/6333 đều đóng. Trước đó (khi Docker
  còn chạy) `ask.e2e-spec.ts` đã pass 4/4; lần chạy full gần nhất 160/161, lỗi duy nhất là
  `idor.e2e-spec.ts` thiếu route mới — đã sửa trong commit này nhưng chưa chạy lại.
- Vì vậy T5.6 giữ trạng thái `in-progress (chờ e2e)` trong `status.md` cho tới khi có Docker.
- SSE hiện phát một `delta` chứa toàn bộ câu trả lời (LLM client chưa stream token); giao thức và UI
  đã sẵn sàng cho nhiều `delta`.
- Hủy phía client dừng vòng ghi SSE và không ghi tiếp vào socket đã đóng; lời gọi LLM đang chạy
  vẫn hoàn tất vì `LlmClient` chưa nhận `AbortSignal` (để T5.7 cùng timeout/retry).
- Chưa có hạn mức/ngân sách/retry cho endpoint này (T5.7) và chưa có rate limit riêng (T6.5);
  `GroqLlmClient` đã có timeout 20 s và lỗi mạng/HTTP thành `AI_UNAVAILABLE`.

## Cách chạy lại

1. Khởi động Docker Desktop (Postgres, Redis, Qdrant theo `docker compose`).
2. `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/ask.e2e-spec.ts test/idor.e2e-spec.ts`
3. Chạy web + API, đăng nhập, mở kênh có tin, bấm **Hỏi**, hỏi một câu, bấm chip trích dẫn để kiểm
   tra nhảy tới tin gốc; chụp ảnh vào thư mục này và cập nhật bảng trên.
