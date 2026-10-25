# Evidence `TG.4` — `Markdown + emoji (ADR-0054): tập con an toàn, không HTML`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên (parser tự viết, không
  dependency).
- Task, nhánh: TG.4 — `feat/tg4-markdown` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base = main sau TG.0.
- Môi trường: Windows, Docker Desktop 28.5.1, Playwright 1.63.

## Thay đổi

- **ADR-0054** (`docs/adr/0054-safe-markdown.md`, accepted theo duyệt): parser tự viết
  (~300 dòng thuần TS, không dependency — lý do: thư viện render HTML string rồi phải
  sanitizer tiếp; tập con cố ý nhỏ để kiểm soát từng token), AST allowlist, render React
  trực tiếp, không `dangerouslySetInnerHTML`, liên kết chỉ http/https.
- **`markdown.ts`** (parser thuần): khối — paragraph/code fence/trích dẫn/danh sách; inline —
  đậm/nghiêng/gạch ngang/inline code/spoiler/mention/shortcode emoji/autolink. `sanitizeUrlCandidate`
  bỏ ký tự điều khiển/zero-width/RTL trước khi kiểm scheme (vô hiệu hóa Unicode欺骗);
  nội dung code không xử lý inline.
- **`markdown-text.tsx`**: renderer dựng element từ AST; spoiler click-để-lộ (aria-pressed +
  i18n vi/en); mention chip; link `rel="noopener noreferrer nofollow" target="_blank"`; memo
  theo content. Gắn vào `message-item.tsx` thay `<p>` plain-text (tin optimistic vẫn parse —
  an toàn vì cùng đường AST).
- **Không đổi API/DB** (lưu văn bản thô như cũ).

## Kiểm chứng

| Tiêu chí                               | Cách thử                                                                                                                                                                                                                                                                                          | Kết quả                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Tập cú pháp đúng ngữ nghĩa             | unit `markdown.test.ts`: inline 4 kiểu, code fence + quote + list, autolink, shortcode, mention, code không xử lý inline, dấu đơn không bật cú pháp                                                                                                                                               | pass                                         |
| **Bộ XSS (16 payload) không thực thi** | unit: `<script>`/`<img onerror>`/`<svg/onload>`/`<iframe>`/event handler; `javascript:`/`data:`/`vbscript:` + JAVASCRIPT hoa; scheme chèn zero-width/RTL/tab/newline; HTML lồng; autolink giả mạo; markdown link độc — mọi link node phải khớp `^https?://`, mọi node thuộc allowlist             | **16/16 pass**                               |
| Qua UI thật                            | web e2e `markdown.spec.ts` (mới): gửi qua composer — strong/em/code/emoji 🔥/mention chip hiển thị đúng; spoiler bấm lộ; link https có rel/target đúng; code block chứa `<script>` như chữ; payload XSS hiện nguyên văn, **article payload không có element `<a>`/`<script>`/`<iframe>`/`<img>`** | pass                                         |
| Hồi quy                                | web unit **171** (149 + 22 markdown), lint/typecheck/format/build/bundle/docs                                                                                                                                                                                                                     | pass — bundle 244,0 KB                       |
| Web e2e full                           | `WEB_PORT=3110 pnpm --filter web exec playwright test --workers=1`                                                                                                                                                                                                                                | **32 pass, 1 skip** (31 + markdown mới)      |
| API e2e                                | full suite                                                                                                                                                                                                                                                                                        | **188/188 pass** (sau khi sửa test presence) |

Chạy lại: `pnpm --filter web exec vitest run src/features/messages/markdown.test.ts`;
e2e: `WEB_PORT=3110 pnpm --filter web exec playwright test e2e/markdown.spec.ts`.

## Phát hiện khi làm

- **Hạ tầng e2e (bài học lớn):** cổng 3000 bị app ngoài chiếm (omni-ai của OWNER) → WEB_PORT=3110
  bị CORS chặn (API chỉ cho phép origin 3000). Sửa gốc trong `playwright.config.ts`: API
  webServer nhận `WEB_ORIGIN=http://localhost:${webPort}` — giờ đổi `WEB_PORT` là đủ cho cả web
  lẫn API. Kèm bài học vận hành: **API tàn hợp từ run cũ bị `reuseExistingServer` tái sử dụng
  với env cũ** — khi đổi WEB_PORT phải kill API cũ trước, nếu không toàn bộ spec auth fail với
  "Network error" (đã gặp: 130 lỗi network trong một run vì API cũ WEB_ORIGIN=3000).
- **Test presence yếu bị bóc ra (lặp lại được, không phải flake):** cửa sổ gộp presence 1 giây (T1.2) có thể mang event trễ
  của user khác — test chờ event đầu tiên rồi assert userId làm đỏ; sửa test: lọc theo
  userId + xả cửa sổ batch trước `assertNoEvent` (không đụng production code).
- Assertion e2e dùng `getByRole('strong')` không khớp dù DOM có (implicit role không nhận
  name lookup) — dùng CSS locator + `toContainText` trên article.
- Parser bug thật bắt được nhờ test: list item lưu mảng dòng nhưng `parseInline` nhận string.

## Giới hạn và tiếp theo

- Tô màu cú pháp code block (tải lười) hoãn — ghi trong ADR.
- Không hỗ trợ `[text](url)` markdown link (chỉ autolink) — đúng hành vi Discord; bộ XSS
  chứng minh payload dạng đó render thành text.
- Kế tiếp theo lịch: TG.23 (emoji picker đầy đủ — tái dùng map shortcode), rồi TG.1 (reply).
