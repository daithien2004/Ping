# Ping-docs — Sổ tay ôn phỏng vấn Fullstack Middle (Phần B)

> **Cho agent thi công:** dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans`. Các bước dùng checkbox `- [ ]`. Task 3–9 độc lập (mỗi task một thư mục chương riêng, sidebar tự sinh) nên chạy song song được.

**Mục tiêu:** `D:\Ping-docs` thành bộ ôn phỏng vấn fullstack middle bằng tiếng Việt: kiến thức từ cơ bản tới nâng cao, mỗi chủ đề nối với chỗ Ping dùng thật, kèm câu hỏi có đáp án.

**Kiến trúc:** VitePress (nội dung `.md`), sidebar tự sinh từ cây thư mục, tìm kiếm cục bộ có hỗ trợ gõ không dấu. Một **bộ kiểm tra tự động** (`scripts/check-docs.mjs`) là cổng chất lượng: cấu trúc bài, đường dẫn/ADR của Ping có thật, không placeholder. Viết bộ kiểm tra trước (đỏ), mỗi chương làm nó xanh.

**Tech:** VitePress `1.6.4`, `vitepress-plugin-mermaid` `2.0.17`, `mermaid` `11.4.1`, pnpm, Node 24 (`node:test` cho test của script).

**Spec:** [2026-11-13-interview-ready-v2-design.md](../specs/2026-11-13-interview-ready-v2-design.md) (mục 6).

## Ràng buộc chung

- Repo riêng `D:\Ping-docs`, `git init`, không remote. Mỗi chương một commit `docs(NN): …`.
- Nguồn sự thật về Ping là repo `D:\Ping` (đọc, không sửa). Biến môi trường `PING_REPO` mặc định `D:\Ping`.
- **Phiên bản Ping đang dùng:** Next 16.4.2, React 19.3.0, TanStack Query 5.104, Zustand 5, antd 6.6, NestJS 12.1, Prisma 7.10, ioredis 6, Zod 4, Socket.IO 4.8, Postgres 17, Redis 7, Qdrant 1.12, Nginx 1.30. Nhiều bản **mới hơn hiểu biết của người viết**: mọi khẳng định riêng cho phiên bản phải đối chiếu docs chính thức đúng phiên bản (WebFetch / agent `web-fetch`) và ghi URL vào `## Nguồn`, không viết theo trí nhớ.
- Số liệu chỉ lấy từ `docs/v0.2.0/evidence/**`, ADR, case study, runbook, hoặc đo mới; không có thì ghi "chưa đo".
- Không chép nguyên văn quá 15 từ từ MDN, sách, blog hay docs; tự diễn đạt lại.
- Chương 14 (chủ đề deploy thực tế) và chương 17 (chủ đề demo trên bản thật) **chờ Plan A** (Task 10); các chủ đề còn lại viết ngay.

## Review Focus (điểm dễ hỏng mà không task nào tự kiểm)

1. **Kiến thức sai vì viết theo trí nhớ với phiên bản mới** → `## Nguồn` bắt buộc ở bài `concept`; Task 11 lấy mẫu đối chiếu.
2. **Khẳng định "Ping dùng X" sai hoặc đường dẫn đã đổi** → quy tắc R5/R6 của bộ kiểm tra, chạy ở mọi task.
3. **Tìm "mat khau" (không dấu) không ra bài chứa "mật khẩu"** → Task 1 cấu hình + kiểm bằng trình duyệt.
4. **Học thuộc không gắn dự án** → mục `## Ping dùng ở đâu` bắt buộc; đáp án câu hỏi nhắc Ping khi có thể.
5. **Ngân hàng câu hỏi lệch với nội dung chương** → chương 19 được **sinh** từ các `<details>` bằng script, không viết tay.

## Khuôn bài (áp dụng cho mọi task chương)

Frontmatter bắt buộc: `title`, `level` (`basic` | `middle` | `advanced`), `kind` (`concept` mặc định | `story` | `special`). Trong một chương, bài xếp từ `basic` lên `advanced`.

`kind: concept` — đủ 6 mục H2, đúng tên và thứ tự: `## Hiểu đúng` · `## Ping dùng ở đâu` (nếu Ping không dùng thì viết "Ping không dùng" và nói vì sao) · `## Câu hỏi phỏng vấn` (**5–10** khối `<details><summary>Câu hỏi</summary>` + đáp án) · `## Bẫy hay gặp` · `## Tự kiểm tra` (**đúng 3** gạch đầu dòng) · `## Nguồn`.

`kind: story` (chương 17, 18) — đủ 4 mục H2: `## Câu chuyện` · `## Số liệu và bằng chứng` · `## Câu hỏi đào sâu` (5–10 khối `<details>`) · `## Điều tôi làm khác đi`.

`kind: special` (chương 00, 19 và các `index.md`) — không bắt mục; vẫn áp dụng R5–R7.

Mỗi chương có `index.md` (H1 = tên chương, 3–5 câu giới thiệu + danh sách bài + gợi ý thứ tự đọc). Tên file bài: `NN-slug.md` (slug ASCII kebab từ tiêu đề, `NN` hai chữ số theo thứ tự đọc). Thư mục chương: `docs/NN-slug/`.

Quy tắc kiểm tra tự động (R1–R7, cài ở Task 2): R1 frontmatter hợp lệ; R2 đủ mục theo `kind`; R3 số khối `<details>` trong khoảng; R4 `## Tự kiểm tra` đúng 3 mục; R5 mọi token inline-code dạng đường dẫn Ping (`apps/…`, `packages/…`, `docs/…`, `ops/…`, `deploy/…`, `tools/…`, `scripts/…`) phải tồn tại trong `PING_REPO` (bỏ hậu tố `:dòng`, bỏ token có `*`); R6 mọi `ADR-NNNN` phải có `docs/adr/NNNN-*.md`; R7 cấm `TODO|TBD|XXX|lorem` (không phân biệt hoa thường).

---

### Task 1: Dựng VitePress, giữ lịch sử, xóa site cũ

**Files:** `D:\Ping-docs\{package.json,.gitignore,README.md}`, `docs/index.md`, `docs/.vitepress/{config.mts,sidebar.mts}`; xóa `src/`, `index.html`, `vite.config.js`, `dist/`, `e2e-run.log`, `pnpm-lock.yaml` cũ.

**Interfaces:**

- Produces: `sidebar.mts` xuất `buildSidebar(docsDir: string): DefaultTheme.Sidebar` — quét `docs/NN-*/`, mỗi chương một nhóm, tiêu đề nhóm = H1 của `index.md`, bài sắp theo tiền tố `NN-`, tiêu đề bài = `title` trong frontmatter. Thêm chương/bài **không phải sửa cấu hình**.
- Scripts: `dev` (`vitepress dev docs`), `build`, `preview`, `check` (`node scripts/check-docs.mjs && vitepress build docs`), `bank` (`node scripts/build-question-bank.mjs`), `test` (`node --test scripts/`).

- [ ] **Step 1:** `git init` (nhánh `main`), thêm `.gitignore` (`node_modules`, `dist`, `docs/.vitepress/cache`, `docs/.vitepress/dist`), **commit snapshot** toàn bộ site React cũ (trừ `node_modules`/`dist`) với message `chore: snapshot legacy React site before rewrite` để lịch sử giữ được nội dung cũ làm nguồn tham khảo.
- [ ] **Step 2:** xóa các file cũ; viết lại `package.json` (private, `type: module`, dependencies **ghim đúng phiên bản** như phần Tech, không `^`); `pnpm install`.
- [ ] **Step 3:** `config.mts` dùng `withMermaid(defineConfig({ lang: 'vi-VN', title: 'Ping Docs', themeConfig: { sidebar: buildSidebar('docs'), search: { provider: 'local' }, outline: { label: 'Trong bài này', level: [2, 3] } } }))`. Nếu `pnpm dev` báo lỗi `dayjs`/ESM của mermaid thì thêm `vite: { optimizeDeps: { include: ['mermaid'] } }`.
- [ ] **Step 4 — tìm kiếm không dấu:** thêm `themeConfig.search.options.miniSearch.options._render = (src, env, md) => { const html = md.render(src, env); return html + ' ' + stripDiacritics(html.replace(/<[^>]+>/g, ' ')) }` với `stripDiacritics = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')` (hàm chạy lúc build nên không vướng việc cấu hình phải serialize). Mục đích: gõ không dấu vẫn tìm ra bài có dấu.
- [ ] **Step 5:** tạo `docs/index.md` (trang chủ, `layout: home`, nút "Bắt đầu" tới chương 00) và một bài thử `docs/99-tam/01-thu.md` chứa tiêu đề "Mật khẩu" và một khối ` ```mermaid ` đơn giản.
- [ ] **Step 6 — kiểm bằng mắt:** `pnpm build` thành công; `pnpm preview`, mở bằng trình duyệt tích hợp: sidebar hiện đúng, sơ đồ Mermaid vẽ ra, gõ `mat khau` vào ô tìm kiếm ra bài thử, gõ `mật khẩu` cũng ra. Chụp ảnh lưu `docs/public/` không cần; chỉ ghi kết quả vào commit message.
- [ ] **Step 7:** xóa `docs/99-tam/`; `README.md` (cách chạy: `pnpm install && pnpm dev`, `pnpm check`); commit `feat: scaffold VitePress handbook`.

### Task 2: Cổng chất lượng (bộ kiểm tra) và sinh ngân hàng câu hỏi — viết test trước

**Files:** `scripts/check-docs.mjs`, `scripts/check-docs.test.mjs`, `scripts/fixtures/{ok,missing-section,bad-path,bad-adr,too-few-questions}/…`, `scripts/build-question-bank.mjs`, `scripts/build-question-bank.test.mjs`, `WRITING.md`.

**Interfaces:**

- `check(docsDir: string, pingRepo: string): Array<{ file: string; rule: 'R1'|'R2'|'R3'|'R4'|'R5'|'R6'|'R7'; message: string }>` (xuất từ `check-docs.mjs`; chạy trực tiếp thì in lỗi, thoát mã 1 nếu có).
- `extractQuestions(markdown: string): Array<{ question: string; answer: string }>` và `bankMarkdown(docsDir: string): string` (xuất từ `build-question-bank.mjs`; chạy trực tiếp ghi `docs/19-on-nhanh/ngan-hang-cau-hoi.md` với đầu file "Tự sinh bởi `pnpm bank`, đừng sửa tay", nhóm theo chương rồi theo `level`, mỗi câu kèm link về bài).

- [ ] **Step 1: viết test đỏ** `check-docs.test.mjs` (`node:test`): `ok` → mảng rỗng; `missing-section` (thiếu `## Bẫy hay gặp`) → có lỗi `R2`; `too-few-questions` (4 khối `<details>`) → `R3`; `bad-path` (token `` `apps/api/khong-co.ts` ``) → `R5`; `bad-adr` (`ADR-9999`) → `R6`; một bài chứa `TODO` → `R7`; bài `kind: story` đủ 4 mục → rỗng. `build-question-bank.test.mjs`: `extractQuestions` trả đúng cặp từ hai khối `<details>`; `bankMarkdown` trên fixture nhóm theo `level`.
- [ ] **Step 2:** `pnpm test` → đỏ đúng lý do (hàm chưa có).
- [ ] **Step 3:** cài `check-docs.mjs` theo quy tắc R1–R7 ở phần "Khuôn bài" (tự viết bộ tách frontmatter nhỏ, không thêm dependency); cài `build-question-bank.mjs`.
- [ ] **Step 4:** `pnpm test` xanh. Chạy `node scripts/check-docs.mjs` trên `docs/` rỗng → không lỗi.
- [ ] **Step 5:** viết `WRITING.md`: khuôn bài, cách đặt tên, quy tắc nguồn/số liệu/bản quyền (copy từ "Ràng buộc chung" và "Khuôn bài"), ví dụ một bài `concept` ngắn đầy đủ (≈ 60 dòng) dùng làm mẫu cho người viết sau.
- [ ] **Step 6:** commit `feat: quality gate and question bank generator`.

### Task 3: Chương 00 (Cách dùng), 17 (Kể về Ping), 18 (Hành vi & làm việc)

**Files:** `docs/00-cach-dung/`, `docs/17-ke-ve-ping/`, `docs/18-hanh-vi/`.

**Nguồn (đọc trước):** `D:\Ping\README.md`, `docs/architecture.md`, `docs/v0.2.0/case-studies/cs-01…cs-09`, `docs/v0.2.0/interview-qa.md`, `docs/v0.2.0/demo.md`, `docs/known-issues.md`, `docs/tech-debt.md`, `docs/adr/0038-*`, `0059-*`, `0089-*`, `0090-*`.

- **00 (special):** lộ trình 4 tuần theo chương; cách ôn (nói thành tiếng, tự chấm); cách trả lời khi không biết.
- **17 (story):** pitch 2 phút; pitch 10 phút kèm sơ đồ Mermaid kiến trúc; chín bài kể lại chín case study (`cs-01`…`cs-09`, mỗi bài theo khuôn story, số liệu lấy đúng case study); "Điều tôi sẽ làm khác đi"; "Giới hạn đã biết và vì sao" (ADR-0059, V6/V7/V8/F7/H2, tech-debt). **Chưa** viết bài "Demo trên bản thật" (Task 10).
- **18 (story):** năm câu chuyện STAR **từ bug thật**: lỗi `key` làm gán nhầm role; validate tags lệch schema shared; lưới picker chặn phím Tab; outbox relay phát trùng (W3/ADR-0090); và làm việc với AI trung thực (cs-07). Mỗi bài ≤ 1 trang, nói được trong 2 phút.
- [ ] **Step 1:** đọc nguồn; **Step 2:** viết `index.md` rồi từng bài; **Step 3:** `pnpm check` xanh; **Step 4:** commit `docs(00,17,18): …`.

### Task 4: Frontend lõi — Chương 04 React, 05 Next.js, 06 Server state & UI state

**Nguồn Ping:** `apps/web/src/features/admin/components/admin-surface/index.tsx` (bug `key`), `apps/web/src/features/emoji/recent.ts` + `components/emoji-picker/index.tsx` (`useSyncExternalStore`), `apps/web/src/lib/use-section-rail.ts`, `apps/web/src/features/messages/**` (optimistic, `message-cache`), `apps/web/src/features/channels/components/channel-navigation/`, `apps/web/next.config.ts`, `apps/web/CLAUDE.md`, ADR-0020, 0022, 0058, 0088.

- **04 React (10 bài):** render và reconciliation; quy tắc hook; state placement (`useState` vs `useReducer` vs suy ra); `useEffect` đúng chỗ và dependency; `key` và danh tính (bug drawer); memo / `useMemo` / `useCallback` khi nào đáng; `useSyncExternalStore`; context và re-render; Suspense và lazy; `<Activity>` (ADR-0020); controlled/uncontrolled và IME.
- **05 Next.js (6 bài):** App Router và layout; server vs client component; cache và `cacheComponents` (ADR-0022); routing/params và vì sao không dùng `useParams()` (ADR-0020/0088); security headers + CSP trong `next.config.ts`; bundle, code split và ngân sách (ADR-0058), biến `NEXT_PUBLIC_*` nướng vào bundle.
- **06 Server state (7 bài):** TanStack Query cơ bản (key, `staleTime`); mutation và invalidate; optimistic update + rollback; infinite query + cursor; hàm biến đổi cache thuần có test (`*-cache.ts`); Zustand và ranh giới với Query; realtime ghi vào cache.
- [ ] **Step 1:** đọc nguồn Ping + docs chính thức React 19 / Next 16 / TanStack Query 5 đúng phiên bản; **Step 2:** viết `index.md` + bài theo `WRITING.md`; **Step 3:** `pnpm check` xanh; **Step 4:** commit `docs(04-06): …`.

### Task 5: Dữ liệu và realtime — Chương 09 CSDL, 10 Redis, 11 Realtime

**Nguồn Ping:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`, `apps/api/src/infra/events/outbox-relay.service.ts`, `apps/api/src/infra/redis/**` (redis-policy), `apps/api/src/common/rate-limit-buckets.ts`, `apps/web/src/features/realtime/session.ts`, case study 01–04, ADR-0026, 0033, 0043, 0044, 0045, 0077, 0080, 0090, `docs/perf/**`.

- **09 CSDL (8 bài):** SQL và join; index B-tree + đọc `EXPLAIN`; GIN/FTS/trigram (ADR-0045); transaction, isolation, khóa (`FOR UPDATE SKIP LOCKED` của outbox); N+1 và cursor pagination bằng UUIDv7; migration expand/contract; Prisma (adapter, `PG_POOL_MAX`); mô hình hóa (unique, xóa mềm).
- **10 Redis (6 bài):** kiểu dữ liệu; cache + TTL; pub/sub vs stream (consumer group, outbox); rate limit theo bucket (ADR-0080); presence và gom batch; fail-open vs fail-closed (ADR-0026).
- **11 Realtime (7 bài):** polling vs SSE vs WebSocket; Socket.IO room và ack; nhiều instance + Redis adapter; thứ tự, mất gói, gap recovery (ADR-0044); idempotency và nonce; outbox (ADR-0090, cs-02); presence storm (cs-01) và reconnect có jitter.
- [ ] **Step 1–4** như Task 4 (docs chính thức: PostgreSQL 17, Prisma 7, Redis 7, Socket.IO 4.8); commit `docs(09-11): …`.

### Task 6: Backend và bảo mật — Chương 08 Node & NestJS, 12 Xác thực & bảo mật

**Nguồn Ping:** `apps/api/src/modules/**` (mẫu controller/service/module), `apps/api/src/config/env.schema.ts`, `apps/api/src/main.ts`, `apps/api/src/worker.ts`, `apps/api/test/idor.e2e-spec.ts`, `packages/shared/src/permissions/**` (`defineAbilityFor`), `apps/api/src/modules/auth/**`, `docs/security/**`, `docs/api-conventions.md`, case study 04–05, ADR-0004, 0007, 0010, 0025, 0027, 0053.

- **08 NestJS (7 bài):** event loop Node và không chặn; module / DI / provider; vòng đời request (middleware → guard → pipe → interceptor → filter); validate bằng zod; lỗi và `ErrorCodes`; cấu hình + schema env; graceful shutdown và process worker.
- **12 Bảo mật (10 bài):** hash mật khẩu argon2; session và refresh token (rotation, reuse detection); JWT access ngắn hạn (`ACCESS_TOKEN_TTL` 15 phút); cookie flag + CSRF (ADR-0027); XSS và CSP; IDOR và test quét route (`ID_ROUTES`); RBAC/ABAC với CASL (ADR-0004/0025); chống brute force/rate limit; upload an toàn (ADR-0053); LLM là dependency không tin cậy (cs-05); bản đồ OWASP Top 10 → Ping.
- [ ] **Step 1–4** như Task 4 (docs: NestJS 12, CASL 7, OWASP); commit `docs(08,12): …`.

### Task 7: Nền tảng — Chương 01 Web, 02 JavaScript, 03 TypeScript

**Nguồn Ping:** `docs/api-conventions.md`, `ops/nginx/**`, `packages/shared/src/**` (zod schema, kiểu dùng chung), `packages/tsconfig/**`, `apps/web/src/lib/api-client.ts`, ADR-0002, 0027.

- **01 Web (7 bài):** HTTP và REST; status code và idempotency; cookie / session / token; CORS và same-origin; TLS, HTTPS, DNS; từ gõ URL tới thấy trang; cache HTTP (ETag, `Cache-Control`).
- **02 JavaScript (8 bài):** kiểu và so sánh; scope, closure, hoisting; `this` và prototype; event loop và microtask; promise, `async/await`, lỗi; ESM vs CJS; bất biến và sao chép nông/sâu; `Map`/`Set`, iterator, generator.
- **03 TypeScript (7 bài):** `type` vs `interface`; generic; narrowing và discriminated union; utility type; `strict`, `unknown` vs `any`; zod và `infer` (kiểu lúc chạy vs lúc biên dịch); module resolution `nodenext` (vì sao Ping bắt import có đuôi `.js`).
- [ ] **Step 1–4** như Task 4 (docs: MDN ghi URL, không chép; TypeScript handbook); commit `docs(01-03): …`.

### Task 8: UI và kiểm thử — Chương 07 UI/a11y/i18n, 13 Kiểm thử

**Nguồn Ping:** `apps/web/src/components/ui/**` (`Ping*`), `apps/web/src/lib/theme/tokens.ts`, `apps/web/src/lib/grid-arrow-key-index.ts` (+ test), `apps/web/e2e/a11y.spec.ts`, `apps/web/messages/*.json`, `apps/web/playwright.visual.config.ts`, `apps/api/test/**`, `apps/api/test/drill/**`, `.github/workflows/ci.yml`, ADR-0023, 0029, 0050, 0051, 0073, 0074, 0075, 0089.

- **07 UI (7 bài):** design token và wrapper component (`Ping*`); Tailwind và antd chung layer; a11y (ARIA, focus, bàn phím — kể cả bug chặn Tab của lưới picker); axe và kiểm thử a11y; i18n vi/en; responsive; hiệu năng UI (virtualize, LCP/INP/CLS).
- **13 Kiểm thử (7 bài):** kim tự tháp test; unit với Vitest; e2e API (supertest + DB thật); e2e web Playwright; visual regression và quy tắc không đổi baseline để che lỗi (ADR-0074); test double và fake; TDD / test đỏ trước; chaos drill (redis outage); coverage đúng nghĩa.
- [ ] **Step 1–4** như Task 4 (docs: WAI-ARIA, Vitest, Playwright); commit `docs(07,13): …`.

### Task 9: Kiến trúc, vận hành, AI — Chương 15 System design, 16 AI/RAG, 14 DevOps (trừ bài deploy thực tế)

**Nguồn Ping:** `docs/architecture.md`, `docs/discord-practices.md`, `docs/tech-debt.md`, `docs/runbook/**`, `docker-compose.prod.example.yml`, `Dockerfile*`, `.github/workflows/{ci,publish-deploy}.yml`, `deploy/*.sh`, `ops/**`, `apps/api/src/modules/ai/**`, case study 05–06, ADR-0031, 0032, 0033, 0036, 0045–0047, 0059, 0083.

- **14 DevOps (8 bài):** Docker image multi-stage; Compose production; CI (check bắt buộc, lọc theo vùng); GHCR và deploy theo SHA bất biến (ADR-0083); rollback và tương thích migration; Nginx reverse proxy + TLS (certbot, chứng chỉ IP); backup/restore và RPO/RTO; observability (log `requestId`, metrics, Sentry đã scrub — ADR-0031) và load test (ADR-0033).
- **15 System design (6 bài):** khung trả lời 45 phút; thiết kế chat kiểu Discord; fan-out và scale WebSocket; lưu trữ tin nhắn và sharding; presence và tìm kiếm ở quy mô lớn; đánh đổi của Ping và cách mở rộng (từ tech-debt).
- **16 AI/RAG (7 bài):** embedding; vector DB (Qdrant); chunk + index qua outbox; retrieval có kiểm soát quyền; prompt, citation, fail-closed; ngân sách và rate (ADR-0047); đánh giá (eval).
- [ ] **Step 1–4** như Task 4; commit `docs(14-16): …`.

### Task 10: Hoàn thiện phần phụ thuộc Plan A (chạy sau khi Plan A xong Task 4–11)

**Files:** `docs/14-devops/NN-deploy-thuc-te.md` (concept), `docs/17-ke-ve-ping/NN-demo-tren-ban-that.md` (story), cập nhật số liệu ở các bài chương 14/17 nếu có.

**Nguồn:** `D:\Ping\docs\v0.2.0\evidence\V2-final\*.md` (deploy, TLS, rollback, backup, scroll, load, flows), `docs/v0.2.0/acceptance/v0.2.0.md`, `docs/runbook/demo-data.md`.

- [ ] **Step 1:** bài "Deploy thực tế": đường đi CI → GHCR → VPS, thời gian rollback đo được, RPO/RTO đo được, giới hạn load test (nêu rõ "bộ dữ liệu demo nhỏ"), chứng chỉ IP 6 ngày và vì sao cân nhắc tên miền.
- [ ] **Step 2:** bài "Demo trên bản thật": kịch bản 5 phút trên link thật, tài khoản `demo1`/`demo2`, việc bấm thử được và không được (AI/GIF), cách trả lời khi demo lỗi.
- [ ] **Step 3:** rà các bài chương 14/17/18 đã viết trước đó cho khớp số liệu mới (không còn "chưa kiểm" cho mục đã đóng).
- [ ] **Step 4:** `pnpm check` xanh; commit `docs(14,17): add live deployment topics`.

### Task 11: Kiểm tra cuối

- [ ] **Step 1:** `pnpm bank` sinh `docs/19-on-nhanh/ngan-hang-cau-hoi.md`; viết `docs/19-on-nhanh/index.md` và `checklist-truoc-phong-van.md` (kind special: ôn gì mỗi ngày trong 3 ngày cuối, chuẩn bị máy/mạng/tài khoản demo, câu hỏi để hỏi lại nhà tuyển dụng).
- [ ] **Step 2:** `pnpm test && pnpm check` xanh; đếm: số chương (kỳ vọng 20), số bài, số câu hỏi (ghi vào README).
- [ ] **Step 3 — lấy mẫu độc lập:** chọn 15 khẳng định ngẫu nhiên dạng "Ping dùng X ở Y" và 10 khẳng định kiến thức riêng cho phiên bản (React 19, Next 16, NestJS 12, Prisma 7); đối chiếu code/ADR/docs chính thức. Ghi bảng kết quả vào `QA.md`; sửa mọi chỗ sai rồi lấy mẫu lại 5 khẳng định ở chương có sai.
- [ ] **Step 4 — kiểm bằng mắt:** `pnpm preview`; tìm `ADR-0044`, `skip locked`, `mat khau` đều ra; mở 5 bài bất kỳ trên màn hẹp 375 px và dark mode, sơ đồ Mermaid vẽ đúng.
- [ ] **Step 5:** commit `docs: final QA and question bank`; `git tag v1`.
