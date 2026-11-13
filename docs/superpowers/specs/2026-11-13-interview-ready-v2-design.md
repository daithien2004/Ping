# Thiết kế: Chốt Ping v2 để phỏng vấn + bộ ôn tập Ping-docs

Ngày: 2026-11-13. Trạng thái: chờ OWNER duyệt.

## 1. Mục đích (vì sao)

OWNER sẽ mang Ping đi phỏng vấn vị trí **fullstack mức middle**. Thành công nghĩa là:

1. Người phỏng vấn mở được link chạy thật, bấm thử, đọc README/ADR thấy dự án nghiêm túc và trung
   thực về giới hạn.
2. OWNER **giải thích được** mọi quyết định trong Ping và trả lời được câu hỏi nền tảng mà nhà tuyển
   dụng dùng để tách middle khỏi junior.

Nhận định chốt: với mức middle, Ping đã **thừa** tính năng (RAG, outbox, CASL, IDOR test, CI/CD,
deploy VPS). Rủi ro phỏng vấn không phải thiếu tính năng mà là OWNER không giải thích nổi cái đã có
(phần lớn code viết cùng AI — xem [cs-07](../../v0.2.0/case-studies/cs-07-claude-workflow.md)). Vì vậy
phần A làm gọn, phần B là trọng tâm.

## 2. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**

- A. Chốt v2: code mới nhất chạy trên link thật, cổng nghiệm thu cập nhật trung thực, tag `v0.2.0`.
- B. `D:\Ping-docs` thành bộ ôn phỏng vấn fullstack middle, từ cơ bản tới nâng cao, gắn với code
  Ping thật.

**Không làm**

- Không thêm tính năng sản phẩm mới.
- Không thêm hạ tầng trả phí (ngoại trừ tên miền nếu OWNER tự quyết — mục 5.A6).
- Không chạy full e2e sau từng thay đổi nhỏ; full e2e chạy ở A0 và trước lần push phát hành.
- Không dịch tài liệu sang tiếng Anh.

**Phản mục tiêu** (làm "xong" mà vẫn là thất bại)

- Tài liệu kiểu sách giáo khoa chung chung, không nối với Ping → OWNER vẫn trả lời như junior.
- Tài liệu khẳng định Ping làm điều nó không làm, hoặc số liệu không có bằng chứng.
- Đánh dấu mục cổng nghiệm thu "đạt" khi không có bằng chứng thật.
- Chép nguyên văn nội dung từ sách/blog có bản quyền — phải tự viết lời giải thích.

## 3. Hiện trạng (đã kiểm 2026-11-13)

- Bản deploy: `https://20.193.75.48` trả 200, `/api/v1/health` ok. Pipeline CI → GHCR → VPS, pin SHA,
  rollback theo SHA ([ADR-0083](../../adr/0083-ghcr-and-github-actions-vps-deployment.md)). Chứng chỉ
  Let's Encrypt cho IP, hạn ~6 ngày (hiện tới 2026-11-18), certbot tự gia hạn. Runbook sẵn:
  `docs/runbook/{ci-cd-vps,vps-ip-tls,rollback,backup-restore}.md`.
- `origin/main` = `157f70b`. Thay đổi phiên 2026-11-13 (audit feature-structure, xóa skin
  Pixel/Pop — [ADR-0089](../../adr/0089-bo-skin-pixel-va-pop.md)) **chưa commit**; typecheck/lint/
  unit test (550) xanh, e2e/visual chưa chạy.
- Cổng nghiệm thu [acceptance/v0.2.0.md](../../v0.2.0/acceptance/v0.2.0.md): 23/33 đạt. Văn bản
  viết trước khi có deploy (08/11) nên V2/V4 ghi "chưa kiểm" vì lý do đã không còn đúng.
- README đầu trang vẫn ghi "bản demo local" — đã cũ.
- Nguyên liệu sẵn: 83 file ADR (đánh số tới 0089), 9 case study, `interview-qa.md` (45 câu), `demo.md` (kịch bản 5 phút),
  `architecture.md`, `api-conventions.md`, `security/`.
- `D:\Ping-docs`: site React 19 + Vite + Mermaid, 5 chủ đề trong menu (FE tổng quan, antd, luồng
  FE→BE, gửi tin, tạo server) + ~10 file chủ đề chưa nối menu; gần như chỉ frontend/messages. Không
  có git.

## 4. Các cách đã cân nhắc

**Ping-docs làm bằng gì**

| Cách                                       | Đánh đổi                                                                                                      | Chọn             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| A. Giữ React + Vite, viết lại nội dung JSX | Có khung + Mermaid; viết chậm, không tìm kiếm, thêm bài phải sửa code                                         |                  |
| B. VitePress, nội dung `.md`               | Viết nhanh, tìm kiếm toàn văn có sẵn, sidebar, dark mode, đọc được ngoài site; thêm 1 dependency (repo riêng) | **✓ OWNER chọn** |
| C. Thư mục markdown thuần                  | Ít công nhất; không tìm kiếm, sơ đồ phụ thuộc trình xem                                                       |                  |

**Link demo cho phỏng vấn**: dùng bản deploy VPS sẵn có (sự thật, không phải lựa chọn).

**Phạm vi chốt cổng nghiệm thu**

| Cách                                      | Đánh đổi                                                                     | Chọn               |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| Đóng hết mọi mục kể cả `một phần`         | Cần tiền (Sentry/mail/staging) và người thật (pilot)                         |                    |
| Đóng mục rẻ có bằng chứng, còn lại ghi rõ | Trung thực, không tốn tiền; giới hạn thành câu chuyện đánh đổi khi phỏng vấn | **✓ OWNER đồng ý** |

Phân loại chính xác (đối chiếu bảng cổng 2026-11-13; bảng trình bày trong hội thoại trước đó đếm
nhầm, đây là bản đúng):

- **10 mục mở**: V2, V4, V5, V9 (`chưa kiểm`) và F14 (`chưa đo`) đóng bằng bằng chứng thật ở phần A;
  K5, F13 (`chờ phát hành`) đóng khi CI xanh trên commit phát hành (F13 sửa mô tả 72 → 36 ảnh vì đã
  bỏ skin Pixel); F12 (OWNER ký design review) và H3 (tag) chờ OWNER; H2 (pilot cần người thật) ghi là
  giới hạn.
- **11 mục `một phần`** (V1, V3, V6, V7, V8, K1, K2, F2, F7, F9, F16): giữ nguyên trạng thái, chỉ sửa
  câu chữ đã cũ vì nay có deploy; không đổi nhãn khi không có bằng chứng mới.

## 5. Phần A — Chốt v2

"Chốt v2" nghĩa là **mọi tính năng trong phạm vi v0.2.0 (ADR-0038) chạy đúng trên bản thật**, không chỉ
đóng mục giấy tờ. Vì vậy A0 làm trước mọi bước khác.

### A0. Kiểm chứng toàn bộ tính năng

1. **Bộ test tự động đầy đủ** (local, Docker): `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm --filter api test:e2e`, `pnpm --filter web test:e2e`, bộ visual. Đây là lượt chạy full e2e
   của đợt phát hành (khác giai đoạn dọn dẹp trước đó, khi OWNER dặn chưa cần e2e).
2. **Đi 9 luồng chính trên link thật** theo `acceptance/pilot.md` §1: đăng ký/đăng nhập/xác minh; mã
   mời + danh sách kênh; gửi/trả lời/cảm xúc/ghim/sửa/xóa; tệp/ảnh (kiểm định → sẵn sàng → tải xuống);
   unread/mention hai tab; tìm kiếm có lọc + nhảy tới tin; hỏi AI + chip trích dẫn + câu ngoài quyền;
   mất mạng 30–60 giây rồi gửi tiếp (không mất/trùng/sai thứ tự); DM/chặn, đổi tên, sáng/tối, vi/en,
   thu hồi phiên. Dùng trình duyệt tích hợp với hai tài khoản, ở desktop và màn hẹp 375px. Mỗi luồng
   ghi đạt/lỗi + ảnh vào evidence. Thư xác minh: nếu bản thật chưa có mail thật thì ghi đúng như vậy
   (F7 vẫn là `một phần`), dùng đường thay thế đã có.
3. **Phân loại lỗi**: chặn/nặng (luồng chính hỏng, mất dữ liệu, lộ quyền) → sửa trước khi tag, mỗi lỗi
   có test tái hiện; nhẹ (giao diện, chữ) → `docs/known-issues.md` kèm mức độ.
4. **Sửa W3 — outbox relay** (`apps/api/src/infra/events/outbox-relay.service.ts`, known-issues W3):
   (a) không đặt `publishedAt` khi Redis down hoặc chưa `XADD` thành công; (b) chỉ một relay publish
   một bản ghi tại một thời điểm — claim bằng `SELECT … FOR UPDATE SKIP LOCKED` hoặc chỉ chạy relay ở
   worker; (c) vượt `MAX_ATTEMPTS` thì dừng retry và đánh dấu lỗi để quan sát được. Mỗi điểm có test
   (unit hoặc API e2e) đỏ trước, xanh sau. Ghi ADR nếu đổi nơi chạy relay. Cập nhật cs-02 cho khớp; nếu
   vẫn chưa có consumer đọc stream thì case study nói thẳng điều đó.
5. **Đối chiếu `docs/tech-debt.md`**: mục nào đã xử lý (vd pool cấu hình được — T1.1, presence gộp —
   T1.2, runbook VPS đã có) thì chuyển trạng thái kèm bằng chứng; mục còn thật thì giữ, đó là câu trả
   lời cho "nếu có thêm thời gian bạn sẽ làm gì".

### A1–A10. Đóng cổng nghiệm thu

Thứ tự là thứ tự làm. Mỗi bước có bằng chứng ghi vào `docs/v0.2.0/evidence/V2-final/README.md`
(một thư mục evidence cho cả đợt chốt).

1. **Commit thay đổi phiên 2026-11-13** theo nhóm logic (bug fix / tách file / xóa skin / dọn
   comment), Conventional Commits. Trước khi push: chạy `pnpm --filter web test:e2e` (vì có đổi UI:
   xóa skin, tách component) — đây là ngoại lệ duy nhất cho quy tắc "không chạy full e2e", chạy một
   lần trước push vì push = deploy production. Push `main` → CI → deploy. Kiểm link sống lại đúng
   SHA mới.
2. **Dọn `.env.example`**: xóa 2 dòng `NEXT_PUBLIC_ENABLE_PIXEL_SKIN` (agent bị chặn quyền ghi dotfile
   — OWNER tự làm hoặc cấp quyền).
3. **V2 — HTTPS + gia hạn tự động**: trên VPS kiểm `certbot renew --dry-run`, timer certbot đang bật,
   hook Nginx chạy; ghi bằng chứng. Cảnh báo hết hạn: nếu chưa có thì ghi là giới hạn.
4. **V4 — deploy + rollback theo SHA**: diễn tập rollback về SHA trước qua workflow/manual theo
   `rollback.md`, smoke HTTPS + socket, rồi roll forward. Ghi thời gian và kết quả.
5. **V5 — backup ngoài máy + restore**: thêm bản sao backup ra ngoài VPS (đích: xem mục 8, câu hỏi
   cho OWNER), mã hóa trước khi chuyển; diễn tập restore vào DB mới theo `backup-restore.md`; ghi
   RPO/RTO đo được.
6. **F14 — cuộn 10.000 tin**: seed 10.000 tin một kênh (local, production build), đo long task bằng
   Performance trace khi cuộn + tải tin cũ; ghi số. Không đạt thì ghi đúng số, không chỉnh ngưỡng.
7. **V9 — load test từ máy khác**: chạy script tải hiện có (T0.6) từ máy OWNER tới VPS qua Nginx với
   profile nhỏ trước, tăng dần; dừng nếu VPS quá tải. Ghi giới hạn thực tế của VPS.
8. **Dữ liệu demo trên bản thật**: tài khoản demo đăng nhập được, có server/kênh/tin mẫu đủ để bấm
   thử tìm kiếm, reaction, DM; không lỗi console ở luồng chính. Không công khai mật khẩu tài khoản
   quản trị.
9. **Cập nhật tài liệu cho trung thực**: README (bỏ "bản demo local", thêm link demo, tài khoản demo
   và mục "giới hạn đã biết"), `acceptance/v0.2.0.md` (theo phân loại ở mục 4: đóng mục có bằng chứng,
   H2 ghi giới hạn + lý do, 11 mục `một phần` giữ nhãn), `status.md` thêm mục "Chốt v2 (2026-11-xx)".
10. **H3 — tag `v0.2.0`**: chỉ sau khi OWNER duyệt cổng nghiệm thu; theo checklist phát hành trong
    `CONTRIBUTING.md`.

Mục tùy chọn A6 (quyết định của OWNER, không chặn): mua tên miền → đổi `PUBLIC_URL`/`PRODUCTION_URL`
và cấp chứng chỉ tên miền theo ADR-0083.

## 6. Phần B — Ping-docs (VitePress)

### 6.1 Cấu trúc kỹ thuật

- Xóa toàn bộ site React cũ trong `D:\Ping-docs` (OWNER đồng ý), `git init`, không có remote (OWNER
  tự thêm nếu muốn).
- VitePress (bản stable mới nhất, kiểm docs đúng version trước khi cấu hình) + plugin Mermaid; tìm
  kiếm local tích hợp sẵn (`search.provider: 'local'`). pnpm.
- Mỗi chương một thư mục `docs/NN-ten-chuong/`, mỗi chủ đề một file `.md`. Sidebar khai báo trong
  `.vitepress/config`.
- Link sang code Ping viết dạng đường dẫn tương đối repo (`apps/api/src/...`) kèm số ADR; không nhúng
  code dài — trích tối đa ~20 dòng có chú thích.

### 6.2 Khuôn mỗi chủ đề

```
# <Chủ đề>                       [Cơ bản | Middle | Nâng cao]
## Hiểu đúng            — giải thích bằng lời của mình, ví dụ nhỏ
## Ping dùng ở đâu      — file + ADR + vì sao chọn vậy (bỏ qua nếu Ping không dùng, ghi rõ)
## Câu hỏi phỏng vấn    — 5–10 câu, đáp án ẩn trong <details>
## Bẫy hay gặp          — lỗi thật (ưu tiên bug thật của Ping)
## Tự kiểm tra          — 3 câu ngắn để biết đã nắm chưa
```

### 6.3 Khung chương trình

| #   | Chương                  | Nội dung chính                                                                                                                 | Neo vào Ping                               |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 00  | Cách dùng tài liệu      | lộ trình 2–4 tuần, đánh dấu mức, cách ôn                                                                                       | —                                          |
| 01  | Nền tảng web            | HTTP/REST, status code, cookie/session, CORS, DNS/TLS, trình duyệt render                                                      | `api-conventions.md`, Nginx                |
| 02  | JavaScript              | kiểu, scope/closure, `this`, prototype, event loop, promise/async, module                                                      | utils, realtime                            |
| 03  | TypeScript              | type vs interface, generic, narrowing, utility type, strict, zod infer                                                         | `packages/shared`                          |
| 04  | React                   | render, hook rules, `useEffect` đúng chỗ, `key`, state placement, memo, `useSyncExternalStore`, `<Activity>`                   | bug `key` drawer, emoji recent, ADR-0020   |
| 05  | Next.js App Router      | server/client component, routing, cache, CSP/security headers, bundle                                                          | `next.config.ts`, ADR-0058/0088            |
| 06  | Server state & UI state | TanStack Query (cache, invalidate, optimistic, infinite), Zustand                                                              | `*-cache.ts`, ADR-0077                     |
| 07  | UI, a11y, i18n          | design token, wrapper component, ARIA, bàn phím, axe, i18n                                                                     | `Ping*`, `gridArrowKeyIndex` + bug Tab     |
| 08  | Node.js & NestJS        | event loop Node, DI/module, guard/pipe/interceptor, validate, lỗi                                                              | `apps/api/src/modules`                     |
| 09  | Cơ sở dữ liệu           | SQL/join, index B-tree/GIN/trigram, transaction/isolation, N+1, cursor pagination, migration expand/contract, Prisma           | ADR-0045, ADR-0043/0077                    |
| 10  | Redis & cache           | cấu trúc dữ liệu, pub/sub, rate limit, presence, fail-open                                                                     | ADR-0026/0080, cs-01                       |
| 11  | Realtime                | WS vs polling vs SSE, Socket.IO room, Redis adapter, thứ tự/gap, idempotency, outbox                                           | cs-02, ADR-0044                            |
| 12  | Xác thực & bảo mật      | hash mật khẩu, JWT access/refresh rotation, cookie, CSRF, XSS, CSP, IDOR, RBAC/CASL, OWASP                                     | ADR-0027, `idor.e2e-spec.ts`, cs-04        |
| 13  | Kiểm thử                | kim tự tháp test, unit/e2e/visual, test double, nên test gì                                                                    | Vitest, Playwright, ADR-0074               |
| 14  | DevOps & vận hành       | Docker/compose, CI, GHCR, deploy/rollback, Nginx/TLS, backup, log/metrics/Sentry, requestId                                    | ADR-0083, runbook, cs-06                   |
| 15  | System design           | thiết kế app chat kiểu Discord: scale, fan-out, presence, tìm kiếm, lưu trữ, đánh đổi                                          | toàn bộ Ping, `architecture.md`            |
| 16  | AI/RAG (thêm điểm)      | embedding, vector DB, retrieval có kiểm soát, ngân sách, đánh giá                                                              | T5.x, cs-05                                |
| 17  | Kể về Ping              | pitch 2 phút / 10 phút, kiến trúc, 9 case study kể lại, kịch bản demo trên link thật, câu hỏi đào sâu dễ gặp, giới hạn đã biết | case-studies, `interview-qa.md`, `demo.md` |
| 18  | Hành vi & làm việc      | câu chuyện STAR từ Ping (bug thật, đánh đổi), code review, làm việc với AI một cách trung thực                                 | cs-07, phiên 2026-11-13                    |
| 19  | Ôn nhanh                | ngân hàng câu hỏi gom từ mọi chương, checklist trước buổi phỏng vấn                                                            | —                                          |

### 6.4 Thứ tự viết

Chương 17 (kể về Ping) và 00 viết **trước** vì đó là thứ người phỏng vấn hỏi đầu tiên; tiếp theo
04, 06, 09, 11, 12 (chỗ Ping mạnh nhất, dễ bị đào sâu); rồi phần còn lại. Mỗi chương xong thì
build site để kiểm Mermaid/link.

### 6.5 Kiểm chứng nội dung

- Mọi khẳng định "Ping dùng X" phải có file/ADR tồn tại thật (kiểm bằng grep khi viết).
- Số liệu chỉ lấy từ evidence/ADR/case study; không có thì ghi "chưa đo".
- Kiến thức chung không chắc thì đối chiếu tài liệu chính thức đúng version (React, Next, NestJS,
  Postgres, TanStack Query) thay vì viết theo trí nhớ.

## 7. Ràng buộc

- Quy tắc trong `CLAUDE.md` của Ping áp dụng cho mọi thay đổi ở repo Ping (ADR, migration, i18n,
  e2e khi đổi UI, không commit/push khi OWNER chưa đồng ý).
- VPS là production duy nhất: diễn tập rollback/load test/restore phải có kế hoạch lùi, làm lúc OWNER
  biết; restore làm vào DB mới, không ghi đè DB đang chạy.
- Agent không ghi được dotfile trong repo (`.env.example`).
- Ping-docs là repo riêng, không ảnh hưởng CI/bundle của Ping.

## 8. Quyết định của người viết (OWNER có thể sửa)

- **e2e/visual đỏ ở bước A1**: lỗi thật thì sửa; **không** cập nhật ảnh baseline để che lỗi
  (CLAUDE.md). Baseline skin mặc định không nên đổi khi bỏ Pixel/Pop; nếu lệch thì điều tra trước, và
  nếu là thay đổi có chủ đích thì dừng hỏi OWNER rồi mới sinh lại. CI cũng chạy `web-e2e-gate` và
  `visual` là check bắt buộc, nên lỗi không lọt qua được.
- **V9 và rate limit (ADR-0080)**: không đổi cấu hình production. Dùng user tạo sẵn (không đi qua đăng
  ký), đo theo profile nhỏ tăng dần; nếu rate limit theo IP chặn trước khi VPS bão hoà thì ghi đúng
  như vậy — đó là phát hiện hợp lệ, không phải lỗi.
- **Tài khoản demo**: quyền thấp (thành viên thường của một server demo riêng), chỉ seed dữ liệu cho
  server demo, không đụng dữ liệu khác trên production; thông tin đăng nhập công khai trong README
  (đã thiết kế để công khai). Ghi lệnh reset thủ công vào runbook. Nếu AI/RAG trên bản thật không chạy
  (thiếu key), chương 16 và kịch bản demo ghi rõ là không bấm thử được.
- **Nhịp làm**: phần A và B chạy song song (hai repo độc lập); chương 14 và 17 viết sau khi phần A
  xong vì dùng số liệu thật từ A. Báo OWNER sau mỗi lô chương; OWNER đọc lúc nào tiện, không chặn lô
  sau.

## 9. OWNER đã quyết (2026-11-13)

- **Agent tự SSH vào VPS** cho A3–A7. Điều kiện: OWNER cấu hình SSH cho môi trường agent (host/key —
  agent không tự tạo hay đổi credential); mỗi lệnh ghi/thay đổi production (rollback, restore, cài
  cron/timer, load test) OWNER duyệt từng lần qua hộp thoại quyền; lệnh chỉ đọc (status, log, dry-run)
  chạy được ngay. Trước mỗi diễn tập có bước lùi viết sẵn.
- **Backup ngoài máy = kéo về máy Windows của OWNER**: script chạy bằng Task Scheduler hằng ngày, kéo
  file backup đã mã hóa từ VPS qua SSH/scp, giữ N bản gần nhất. Khóa giải mã không nằm trên VPS cùng
  file backup. RPO thực tế phụ thuộc máy OWNER có bật hay không — ghi rõ trong cổng nghiệm thu.
- **Hạn phỏng vấn ~1 tháng hoặc hơn**: viết đủ 20 chương theo thứ tự ở 6.4, không cắt bản tối thiểu.

## 10. Để lại cho người làm

Lời văn, sơ đồ cụ thể, thứ tự chủ đề trong mỗi chương, số câu hỏi chính xác mỗi chủ đề (trong khoảng
5–10), cách gom commit chi tiết của bước A1.

## 11. Kế hoạch thi công

- Phần A: [2026-11-13-finalize-v2.md](../plans/2026-11-13-finalize-v2.md)
- Phần B: [2026-11-13-ping-docs-interview-handbook.md](../plans/2026-11-13-ping-docs-interview-handbook.md)

Phát hiện khi lập kế hoạch (đã đối chiếu code 2026-11-13): W3 (a) trong known-issues đã sửa từ f3f3d5e, còn lại phát trùng giữa nhiều process + không dừng retry + Redis chết làm cháy attempts; bộ k6 dùng JWT ký sẵn nên không chạy được trên production nếu không lấy token từ API thật; `seed:demo` không dùng được cho production (ghi thẳng DB, tài khoản `password123`).
