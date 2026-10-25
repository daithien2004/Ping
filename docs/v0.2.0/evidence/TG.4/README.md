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

## Sự cố CI (đang theo dõi)

- Run đầu trên main (`953635f`): verify đỏ vì docs:check bắt pseudo-link trong evidence — đã sửa
  (`6072083`).
- Run sau (`6072083`): **web-e2e đỏ với 4 spec CUỐI** (realtime, search, security-headers,
  unread-ui), bắt đầu bằng login API trả !ok — các spec đó rerun **local 4/4 pass** với cùng
  commit. Chẩn đoán: hạ tầng runner 2-core cạn về cuối run (web-e2e dài hơn sau khi thêm
  markdown spec); log chi tiết cần quyền admin nên chưa tải được. Không phải lỗi code
  (không có thay đổi API/DB; các spec fail không đụng markdown). Theo dõi ở run kế tiếp; nếu
  lặp lại thì chia mảng web-e2e trên CI (thay đổi .github/workflows — sẽ đề xuất riêng).
- **Nguyên nhân thật đã tìm ra và sửa:** 4 spec cuối đều đăng nhập qua `POST /auth/login` KHÔNG
  pacing — thêm markdown + chaos-gap đẩy tổng login vượt 10/phút/IP ở cụm cuối (429 → login
  fail → sụp dây chuyền). Sửa: `pacedLogin(request, email, password)` trong `login-pace.ts`
  (pace 6/60 giây, chừa chỗ cho global-setup) — áp dụng cho search, unread-ui, markdown,
  chaos-gap; các spec khác dùng `paceLogin` sẵn có. 4/4 spec đó pass local sau sửa; full run
  31 pass + 1 flake đơn lẻ (admin-invite, pass khi rerun — cùng mức flake đã ghi ở T3.3).

## Giới hạn và tiếp theo

- Tô màu cú pháp code block (tải lười) hoãn — ghi trong ADR.
- Không hỗ trợ markdown link dạng ngoặc vuông (chỉ autolink) — đúng hành vi Discord; bộ XSS
  chứng minh payload dạng đó render thành text.
- Kế tiếp theo lịch: TG.23 (emoji picker đầy đủ — tái dùng map shortcode), rồi TG.1 (reply).
