# Evidence `TG.1` — `Reply trong channel: khoá ngoại tự thân, preview, thanh reply + khối trích dẫn`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent; thiết kế nằm trong kế hoạch Pha G (TG.1) OWNER đã duyệt.
- Task, nhánh: TG.1 — `feat/tg1-reply` (PR nháp local); base `af1a3cd` (main sau TG.23 + sharding CI).
- Commit code: `d89ed14`.
- Môi trường: Windows, Docker Desktop, Playwright 1.63, Postgres/Redis local.

## Thay đổi

- **ADR-0060** (`docs/adr/0060-message-reply.md`): cột `replyToId` tự thân trên `Message`,
  `ON DELETE SET NULL`, kiểm "cùng channel" ở service; preview join tại thời điểm đọc (không
  lưu bản sao nội dung).
- **Migration expand-only** `20261025140747_message_reply_to`: thêm cột + FK; không backfill
  (tin cũ `NULL` = tin thường).
- **API** (`messages.service.ts`):
  - `create` đọc tin gốc trong cùng transaction, `400` nếu không tồn tại hoặc khác `channelId`;
    soft-delete **vẫn cho** reply (giữ ngữ cảnh hội thoại).
  - `replyPreview` cắt 120 ký tự; tin gốc đã xóa → `content: ''`, `deleted: true`.
  - `toMessageDto` map `replyTo` cho **list (`before` + `after`), create, nhánh retry nonce,
    update** — không trả bản ghi thô (`deletedAt`, `author` lồng) ra ngoài.
  - Event `message.created` (outbox + realtime) mang `replyTo` preview.
- **Shared** (`schemas/message.ts`, `events.ts`): `createMessageSchema.replyToId` (UUID tuỳ chọn)
  - type `MessageReplyPreview`; `MessageDto.replyTo` và `MessageCreatedPayload.replyTo`.
- **Web**:
  - Menu tin có "Trả lời" (chỉ khi có quyền `create Message`), không mở dialog.
  - Composer: thanh reply (tác giả + trích đoạn + nút hủy, focus lại ô soạn), gửi kèm
    `replyToId`; gửi xong tự xóa thanh.
  - Tin trả lời: khối trích dẫn trước nội dung, tác giả + đoạn trích; tin gốc đã xóa hiện
    "Tin nhắn đã bị xóa"; bấm để nhảy + tô sáng tin gốc nếu đang trong cửa sổ đã tải.
  - Optimistic: preview dựng từ tin đích trong cache để tin "đang gửi" đã có khối trích dẫn.
  - i18n vi/en: `reply`, `replyingTo`, `cancelReply`, `replyDeleted`, `jumpToOriginal`.

## Kiểm chứng

| Tiêu chí                                               | Cách thử                                                                                    | Kết quả                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview đúng + chặn chéo channel + retry + tin gốc xóa | API e2e `messages.e2e-spec.ts` (case mới, channel riêng)                                    | **12/12 pass** — preview `{id, authorName, content, deleted:false}`; reply khác channel `400`; retry cùng nonce trả đúng tin cũ và giữ `replyTo`; tin gốc xóa mềm → `deleted:true`, `content:''`; `replyToId` không tồn tại `400`                                                                                         |
| Schema khớp migration                                  | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | `No difference detected` (exit 0)                                                                                                                                                                                                                                                                                         |
| Hồi quy API                                            | `pnpm --filter api test:e2e`                                                                | **189/189 pass** (188 + 1 case mới), 118,6 s                                                                                                                                                                                                                                                                              |
| Hồi quy shared                                         | `pnpm --filter @ping/shared test`                                                           | **29/29 pass** (28 + 1 case schema reply)                                                                                                                                                                                                                                                                                 |
| Hồi quy web unit                                       | `pnpm --filter web test`                                                                    | **178/178 pass** (177 + 1 case optimistic preview)                                                                                                                                                                                                                                                                        |
| E2E UI reply                                           | `pnpm --filter web exec playwright test e2e/reply.spec.ts`                                  | **pass 25,4 s** — thanh reply đúng tác giả/trích đoạn; gửi xong preview còn sau reload (server thật); bấm preview → tin gốc visible + `ring-1`; hủy reply ẩn thanh; xóa tin gốc → "Tin nhắn đã bị xóa"                                                                                                                    |
| Hồi quy E2E liên quan                                  | `e2e/permissions.spec.ts`, `e2e/unread-ui.spec.ts`, `e2e/search.spec.ts` (chạy riêng)       | **pass** — permissions cập nhật theo TG.1: member thấy menu trên tin người khác nhưng chỉ có "Trả lời" (không Sửa/Xóa); unread/search pass độc lập                                                                                                                                                                        |
| Toàn bộ web e2e (local)                                | `pnpm --filter web test:e2e` (1 run, 35 test)                                               | **32 pass / 1 skip / 2–3 fail do hạn mức 100 req/phút/IP** — các spec cuối nhận `429` (`GET /servers/:id/unread` với `Retry-After` 16–17 s) và API watch restart giữa run; từng spec đó **pass khi chạy riêng**. CI chạy 3 shard (mỗi runner một IP, production build) nên đây là cổng xác nhận toàn bộ — xem mục CI dưới |
| Bundle ban đầu                                         | `pnpm --filter web build && pnpm --filter web check:bundle`                                 | **244,0 KB** gzip / 8 chunk (≤ 450 KB); tổng lazy 656,1 KB                                                                                                                                                                                                                                                                |
| Bộ chuẩn                                               | typecheck api/web, lint web, `pnpm format`, `docs:check`                                    | pass                                                                                                                                                                                                                                                                                                                      |

## Phát hiện khi làm

- **Prisma 7 từ chối `undefined` trong `data`** (`data: { replyToId: undefined }` lỗi runtime) —
  dùng spread có điều kiện.
- **`select` khoá lạ vẫn qua `tsc`**: `messageWithAuthor` là biến (không phải object literal
  "fresh") nên structural typing cho phép field không tồn tại; Prisma chỉ báo lỗi lúc chạy
  (`Unknown field replyTo`) → web SSR rơi vào error boundary. Bài học: thêm quan hệ vào
  `schema.prisma` + `prisma generate` **trước** khi viết select; typecheck không bắt được.
- **API tàn hợp `dist/main`**: process cũ (build trước khi sửa) sống qua nhiều phiên làm web
  báo "Không truy cập được"; kiểm `CommandLine` và restart API trước khi chạy e2e (lặp lại bài
  học TG.23).
- **Rate limit tin nhắn 10 tin/10 s/(user, channel)**: case reply thêm 5 tin vào channel dùng
  chung làm test "gap recovery" phía sau nhận `429`; tách channel riêng cho case reply.
- **`PingTextArea` forward ref của antd `Input.TextArea` là `TextAreaRef`**, không phải
  `HTMLTextAreaElement`: gọi `setSelectionRange` trực tiếp ném
  `TypeError: el?.setSelectionRange is not a function` (lộ ra khi chèn emoji từ picker —
  TG.23 chỉ gọi `focus()` nên lỗi ẩn). Thêm `resolveTextArea()` đi qua
  `resizableTextArea.textArea` để lấy DOM thật.
- **Menu tin giờ hiện cho mọi tin khi còn quyền gửi** (vì có "Trả lời"), nên
  `permissions.spec.ts` cũ ("member không có menu trên tin owner") phải đổi kỳ vọng: menu có
  nhưng chỉ mục "Trả lời", không có "Sửa"/"Xóa".
- **Hạn mức toàn cục 100 request/phút/IP** làm full web e2e chạy một mạch trên máy dev chạm
  `429` ở các spec cuối (unread/search), khác CI vốn chia 3 shard trên 3 runner. Chạy riêng
  từng spec đều pass; không phải hồi quy của TG.1.

## Giới hạn và tiếp theo

- Preview là **ảnh chụp tại thời điểm tạo**: sửa tin gốc sau đó không cập nhật khối trích dẫn
  của tin trả lời đã tải; tải lại danh sách sẽ thấy nội dung mới.
- Xóa mềm tin gốc không phát event riêng cho người đang mở; tải lại mới thấy "đã bị xóa".
- Bấm khối trích dẫn chỉ nhảy khi tin gốc đã nằm trong cửa sổ tải; permalink `?m=` +
  `GET messages?around=` cho tin cũ hơn thuộc **TG.5**.
- Chưa có index `replyToId` (chưa có truy vấn "các tin trả lời X"); thêm khi TG.3/TG.5 cần.
- CI nhánh `feat/tg1-reply`: **12/12 job success** — run
  [`40208841376`](https://github.com/daithien2004/Ping/actions/runs/40208841376) (verify, api-e2e,
  migrations, docker, drills, security, lighthouse + 3 shard web-e2e production build + gate).
  Còn chờ OWNER duyệt merge `--no-ff` vào `main`.
- Kế tiếp theo lịch: TG.5 (permalink + `?around=`) → TG.2 (reaction — tái dùng emoji picker).
