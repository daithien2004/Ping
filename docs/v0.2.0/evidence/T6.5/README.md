# Evidence T6.5 — Bảo mật bề mặt v0.2.0, threat model, rate limit AI/search, CSP

- Ngày: 2026-10-31 (Asia/Saigon); nhánh `feat/batch1-t65-tf11-tf12`; base `132acfb` (main sau TG.10).
- Không cần ADR mới: T6.5 là rà soát/lấp lỗ hổng trên kiến trúc đã có; mọi thay đổi hành vi đều
  kèm test hồi quy.

## Đã giao

**Threat model** (`docs/security/threat-model.md`):

- Ghi chú trạng thái cập nhật cho v0.2.0; mục T1 chuyển từ 19 lên **61 endpoint IDOR**, khớp bảng
  tự đối chiếu của `test/idor.e2e-spec.ts`.
- Mục **6. Bề mặt v0.2.0 (T18–T32)**: realtime/outbox, AI SSE + quota/chi phí, prompt injection,
  truy xuất vector theo ACL, search ACL, upload/attachment, sticker/emoji, DM/block, phiên đăng
  nhập, ban, category, GIF proxy, prefs, mention `@everyone`, CSP. Mỗi dòng có biện pháp, test làm
  bằng chứng và **rủi ro còn lại viết thẳng** (chưa quét virus, chưa mã hóa đầu cuối, prompt
  injection trong phạm vi ngữ cảnh, CSP `unsafe-inline`).
- Không còn P1 mở theo nghĩa lỗ hổng cho phép đọc/ghi dữ liệu ngoài quyền hoặc chiếm phiên mà
  chưa có biện pháp + test; rủi ro tồn dư (không mã hóa đầu cuối, chưa quét virus, prompt injection
  trong phạm vi ngữ cảnh, CSP `unsafe-inline`) đã ghi rõ ở cột "Rủi ro còn lại".

**Lỗ hổng thật bắt khi rà (search ACL):**

- `GET /servers/:serverId/search` trước đây guard `view Server`; member **thiếu `VIEW_CHANNEL`**
  vẫn đọc được nội dung tin qua search. Đổi guard sang `view Message`
  (`apps/api/src/modules/messages/messages.controller.ts:48`) — `view Message` chỉ được cấp khi có
  `VIEW_CHANNEL`/`SEND_MESSAGES`, nên member bị chặn không còn đọc được nội dung.
- Test hồi quy trong `apps/api/test/search.e2e-spec.ts:249`: hạ `@everyone` về `permissions: '0'`
  → member thường nhận 403, owner vẫn 200. Test đặt cuối file vì nó đổi quyền của server dùng
  chung trong file.

**Rate limit endpoint đắt:**

- `AskRateLimiter` (`apps/api/src/modules/ai/ask/ask-rate-limiter.ts`): **10 câu/phút/user**, khóa
  `ask:<userId>`, trả 429 kèm `Retry-After` **trước khi mở SSE** (lỗi vẫn là JSON thường, không
  phải event stream dở dang).
- `SearchRateLimiter` (`apps/api/src/modules/messages/search-rate-limiter.ts`): **30 truy vấn/phút/
  user**, khóa `search:<userId>`.
- Cả hai dùng `RedisThrottlerStorage` (fixed window Lua) qua `failOpen` — Redis chết thì **cho đi
  tiếp** theo ADR-0026, khác quota AI fail-closed vì Redis là lớp chặn chi phí duy nhất. Ghi rõ
  khác biệt này ở ghi chú vận hành của threat model.

**CSP (`apps/web/next.config.ts` + `apps/web/e2e/security-headers.spec.ts`):**

- Rà lại sau khi thêm Tenor/Sentry/SSE: `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`; `connect-src` chỉ self + API/WS + Sentry;
  `img-src` chỉ self/blob/data/API/`media.tenor.com`; **không wildcard**.
- `'unsafe-inline'` cho script vẫn tồn tại (Next chèn script khởi tạo; nonce không hợp
  `cacheComponents`) — ghi nhận ở T7/T32, phòng thủ chính là không render HTML người dùng (parser
  markdown trả React, không `dangerouslySetInnerHTML`).

**CI lọc theo vùng (kèm trong lô):**

- Job `changes` (`dorny/paths-filter`) xuất `code/api/web/db/infra/deps/docs`; mỗi job chỉ chạy
  vùng liên quan: `api-e2e` ← api, `web-e2e` ← web, `migrations` ← db, `drills` ← api|infra,
  `docker` ← api|web|infra, `security` ← code|infra (audit bước riêng ← deps, promtool ← infra),
  `lighthouse` ← web|infra. `verify` luôn chạy nhưng chỉ format + link check khi docs-only.
- Skip ở cấp job vẫn tính **đạt** cho required check; `web-e2e-gate` giữ `always()` để tổng hợp
  3 shard. Không dùng `paths-ignore` ở cấp `on:` (workflow bị skip sẽ treo "Expected").
- `.env.example`/`.nvmrc` nằm trong vùng api/web/infra để đổi cấu hình boot vẫn chạy đúng job.

## Kiểm chứng

| Hạng mục                   | Kết quả                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search ACL                 | Ca e2e member thiếu `VIEW_CHANNEL` → 403, owner 200 (`search.e2e-spec.ts`)                                                                                                                    |
| Rate limit AI              | Unit 3/3: 10 lượt qua, lượt 11 → 429 `retryAfter`; mã `TOO_MANY_REQUESTS`; Redis chết → fail-open, không gọi `eval`                                                                           |
| Rate limit search          | Unit 2/2: 30 lượt qua, lượt 31 → 429; Redis chết → fail-open                                                                                                                                  |
| API unit                   | **307/307** (41 file; +5 so với 302 của TG.10)                                                                                                                                                |
| Shared/Web unit            | 80/80 và 271/271                                                                                                                                                                              |
| API e2e toàn bộ            | **365/365** (43 file, 193,5 s) với Mailpit bật; lần đầu 361/365 chỉ vì máy local chưa bật `ping-mailpit-1` (ECONNREFUSED 8025) — bật lên chạy lại `account-lifecycle` 8/8 rồi full suite sạch |
| IDOR                       | 61 route, `idor.e2e-spec.ts` 5/5                                                                                                                                                              |
| `pnpm security`            | `pnpm audit --prod --audit-level=high`: **7 lỗ hổng (2 low, 5 moderate)**, **0 high/critical**, exit 0                                                                                        |
| Migration                  | DB trống `migrate deploy` 33 migration sạch; `migrate diff --from-config-datasource --to-schema … --exit-code` → **No difference**                                                            |
| CSP/a11y                   | `security-headers.spec.ts` xanh trong full web e2e; không nguồn wildcard mới                                                                                                                  |
| Format/docs/lint/typecheck | `format:check` sạch, `docs:check` 0 link hỏng, lint 0 error, typecheck 4/4                                                                                                                    |
| Build/bundle               | `pnpm build` 3/3 task; **248,2 KB gzip** (≤ 450 KB)                                                                                                                                           |

## Lưu ý

- Rate limit AI/search **fail-open** khi Redis chết: chấp nhận để chat/tìm kiếm vẫn dùng được
  (ADR-0026); bảo vệ chi phí AI vẫn còn quota fail-closed + kill-switch ngân sách đọc Postgres.
- `pnpm security` chỉ tương đương bước audit của CI; gitleaks/Trivy/promtool vẫn cần Docker/CI nên
  không chạy trong lệnh local này.
- Search e2e dùng chung server A cho nhiều ca nên ca hạ quyền `@everyone` phải đứng cuối file;
  thêm ca mới vào file này đặt **trước** ca đó.
