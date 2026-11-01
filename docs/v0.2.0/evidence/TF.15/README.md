# Evidence TF.15 — Web Vitals (INP/LCP/CLS) + bundle theo route và treemap

- Ngày/múi giờ: 2026-11-01 13:00–13:10 (Asia/Saigon).
- Người thực hiện/review: agent thi công; OWNER duyệt phạm vi lô gộp 3.
- Task, nhánh: TF.15, `feat/batch3-tf13-tf15-t7`, PR nháp local; base `3ed2ff4`.
- Môi trường: Windows 11, Node 24.18.0, Chromium 153.0.8010.12, viewport 1280×800; web
  **production** (`next build` + `next start`), API production, Postgres 17 + Redis 7 local;
  máy dev đang chạy Docker/e2e nên số LCP chịu ảnh hưởng tải nền.
- Phụ thuộc/thiết kế: ngân sách bundle theo [ADR-0058](../../../adr/0058-bundle-budget-initial-js.md)
  (JS tải ban đầu = chunk base, route có trần riêng 160 KB/chunk); không cần ADR mới vì phép đo
  không đổi và không vượt trần.

## Đã giao

- `apps/web/scripts/measure-perf.mjs`: đo lab trên landing `/` và chat (seed general) bằng
  PerformanceObserver (`largest-contentful-paint`, `layout-shift`, `event`, `longtask`), 2 lượt,
  in + ghi `perf-report.json`. INP lấy **event duration lớn nhất** trong các tương tác chủ động
  (bấm CTA landing; gõ composer, mở search, mở quick switcher ở chat) — xấp xỉ p98, không thay RUM.
- `apps/web/scripts/bundle-routes.mjs`: báo cáo JS tải ban đầu **theo route** từ
  `page_client-reference-manifest.js` của Turbopack + base `build-manifest.json`; gzip từng chunk
  và cộng. Không đặt ngưỡng mới; `package.json` đổi `check:bundle` chạy cả hai script.
- Ảnh treemap module-level (Client, "Initial load only") từ `next analyze`:
  [chat](../../perf/2026-11-01-treemap-chat.png) và
  [landing](../../perf/2026-11-01-treemap-landing.png);
  số thô [perf-report.json](../../perf/2026-11-01-perf-report.json),
  [bảng JS theo route](../../perf/2026-11-01-bundle-route-report.txt).

## Web Vitals (lab, 2 lượt)

Lệnh: `pnpm --filter web exec node scripts/measure-perf.mjs` (API :4000 + web :3000 production).

| Màn     | LCP lượt 1 / 2     | CLS        | INP lượt 1 / 2 | Long task | Nhận xét theo ngưỡng web.dev                                                    |
| ------- | ------------------ | ---------- | -------------- | --------- | ------------------------------------------------------------------------------- |
| Landing | **1264 / 268 ms**  | **0**      | 16 / 16 ms     | 2 / 1     | LCP tốt (≤ 2500 ms), CLS tốt (≤ 0,1), INP tốt (≤ 200 ms)                        |
| Chat    | **3556 / 2948 ms** | **0,0289** | 32 / 32 ms     | 1 / 1     | INP/CLS tốt; LCP chậm hơn ngưỡng tốt do chờ dữ liệu tin + socket, cần cải thiện |

- LCP chat đo sau khi danh sách tin đổ xong (phần tử lớn nhất là khung hội thoại), không phải
  LCP của shell tĩnh; trên máy dev có Docker/e2e nên số cao hơn CI runner. Không kết luận SLA.
- CLS chat 0,0289 (một lần shift khi khung tin đổ vào) vẫn trong ngưỡng tốt; landing 0.
- Số lượt 1 landing cao hơn do cold cache; lượt 2 phản ánh cache nóng. Báo cáo cả hai, không chọn
  số đẹp.

## Bundle

`pnpm --filter web check:bundle`:

```
JS tải ban đầu: 248.2 KB gzip (8 chunk); tải theo yêu cầu: 791.4 KB (74 chunk);
tổng mọi chunk (tham khảo): 1039.5 KB
```

- Ngân sách **≤ 450 KB** gzip JS tải ban đầu: **đạt** (248,2 KB, dư 201,8 KB).
- JS theo route (base 248,5 KB + chunk của route; gzip, ước lượng từ client-reference manifest):

| Route                                             | JS tải ban đầu | Chunk |
| ------------------------------------------------- | -------------- | ----- |
| `/` (landing)                                     | 458,8 KB       | 31    |
| `/login`                                          | 486,9 KB       | 34    |
| `/servers`                                        | 549,3 KB       | 38    |
| `/dms/[channelId]`                                | 603,8 KB       | 41    |
| `/servers/[serverId]/channels/[channelId]` (chat) | 609,7 KB       | 41    |
| `/servers/[serverId]/settings` (quản trị)         | 662,2 KB       | 42    |

- Đọc đúng định nghĩa ADR-0058: con số **248,2 KB** là phần base mà mọi route đều tải trước khi
  điều hướng; phần route (210–414 KB) là chunk client của chính route đó, mỗi chunk vẫn dưới trần
  160 KB. Đối chiếu nhanh bằng network listener khi tải thật: landing 554,1 KB gzip (28 request),
  chat 710,8 KB gzip (43 request) — cao hơn ước lượng manifest ~12–16% vì manifest không liệt kê
  hết chunk phụ trợ; cùng thứ hạng, không đổi kết luận.
- Treemap (module-level, chưa nén, chỉ đường tải ban đầu): chat **1,17 MB** — `next` 356,2 KB,
  `antd` 285,2 KB, `zod` 210,6 KB, `react-dom` 124,4 KB, `@sentry/browser` 116,7 KB, code
  `src/` 194,0 KB; landing **919,0 KB** — `next` 345,8 KB, `zod` 210,6 KB, `antd` 152,1 KB,
  `sentry` 116,7 KB, `react-dom` 124,4 KB, `src/` 69,1 KB.
- Quan sát đáng theo dõi: `zod` ~210 KB nằm trên đường tải ban đầu (dùng chung schema qua
  `@ping/shared`); nếu cần giảm LCP chat/landing thì đây là ứng viên số một, chưa xử lý trong
  TF.15 vì không phải hồi quy và không vượt ngân sách.

## Import theo thành phần, icon theo tên, route tải lười

- Lint `no-restricted-imports` (ADR-0050) chỉ cho `antd`/`antd/*` trong `src/components/ui/**`,
  `src/lib/theme/**`, `src/providers/**` và 4 file layout allowlist. Quét toàn `src` ngoài các
  đường dẫn này: **0** import `antd`; treemap cho thấy từng module `antd/es/...` riêng, không có
  blob cả gói.
- Icon: 32 file dùng import có tên từ `lucide-react` (`import { X } from 'lucide-react'`), không
  có `import * as`.
- Tải lười: `next/dynamic` ở `ask-dialog.tsx` (AI + SSE), `search-dialog.tsx`, `quick-switcher-host.tsx`
  (modal), `admin-surface.tsx` (drawer chi tiết thành viên), `message-composer.tsx`/`message-reactions.tsx`
  (picker). `e2e/quick-switcher.spec.ts` chứng minh trước `Ctrl+K` **không có**
  `quick-switcher-input` trong DOM; `check:bundle` xếp 74 chunk (791,4 KB) vào nhóm tải theo yêu cầu.
- Trang `/dev/ui` có route nhưng gọi `notFound()` khi production (không phục vụ).

## Review, giới hạn và tiếp tục

- **Không có RUM/field data**: INP/LCP/CLS là lab trên một máy, không thay dữ liệu người dùng thật;
  chưa bật throttling CPU/network, chưa đo thiết bị di động thật hay Safari/Firefox.
- LCP chat 2,9–3,6 s **chưa đạt ngưỡng tốt 2,5 s** trên máy dev; nguyên nhân chính là chờ API tin
  - socket + hydrate, đã có LCP 6,2–6,6 s trong Lighthouse T6.10. Đề xuất bước sau: đo lại trên CI
    runner sạch, cân nhắc giảm `zod`/sentry khỏi đường tải ban đầu hoặc skeleton nhẹ hơn; không hạ
    ngưỡng Lighthouse.
- Per-route bundle ước lượng từ manifest thấp hơn network thật ~12–16%; dùng để so sánh tương đối,
  không dùng làm con số tuyệt đối trong tài liệu ra ngoài.
- Chạy lại: `pnpm --filter web build && pnpm --filter web check:bundle`; Web Vitals:
  `pnpm --filter web exec node scripts/measure-perf.mjs` (cần API + web bản production, DB seed).
  Treemap: `pnpm --filter web exec next analyze --port 4100` rồi mở route tương ứng.
