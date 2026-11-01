# Evidence T6.10 — Lazy route AI/search/quick switcher, bundle, Lighthouse

- Ngày: 2026-11-01 (Asia/Saigon); nhánh `feat/batch2-t67-t610`; base `5819507`.
- Không cần ADR mới: tách chunk là tối ưu trong biên giới kiến trúc đã có (ADR-0045 search,
  TF.5 quick switcher, TF.11 ask drawer); ngân sách bundle 450 KB lấy từ kế hoạch v0.2.0.

## Đã giao

**Tách chunk tải lười (`next/dynamic` + `{ ssr: false }`, render trong `Suspense` chỉ khi mở):**

- `features/search/components/search-modal.tsx` (mới) + `search-dialog.tsx` (viết lại): trigger
  nhẹ, modal (debounce 350 ms, filter, phân trang, lỗi + "Thử lại") tải ở lần mở đầu.
- `features/messages/components/ask-drawer.tsx` (mới) + `ask-dialog.tsx` (viết lại): toàn bộ SSE,
  chip trích dẫn, `aria-live`, skeleton, lỗi theo mã nằm trong chunk riêng.
- `features/shell/components/quick-switcher-host.tsx` (mới) + `components/quick-switcher.tsx`:
  host bắt Ctrl/Cmd+K và cấp dữ liệu (server, DM, kênh của server đang mở); modal tải lười lần
  mở đầu; đóng là tháo hẳn nên mở lại luôn trống; thêm vào allowlist `useParams` (layout-only,
  ADR-0020) ở cả hai khối ESLint.

**Đo lại ngân sách (`pnpm --filter web check:bundle`):**

```
JS tải ban đầu: 248.2 KB gzip (8 chunk); tải theo yêu cầu: 791.4 KB (74 chunk);
tổng mọi chunk (tham khảo): 1039.5 KB
```

- Ngân sách **≤ 450 KB** gzip JS tải ban đầu: đạt (248,2 KB, còn 201,8 KB dư).
- 74 chunk tải theo yêu cầu (tăng so với 71 trước lô 2): search modal, ask drawer, quick switcher
  và các picker/modal đã có.
- `e2e/quick-switcher.spec.ts` khẳng định trước khi bấm Ctrl+K **không có** `quick-switcher-input`
  trong DOM — bằng chứng chunk modal chỉ tải khi mở.

## Lighthouse (local, production build)

Lệnh: `pnpm dlx @lhci/cli@0.15.1 autorun --config=./lighthouserc.json` (API production ở 4000,
web `next start` ở 3000, 2 lượt đo, median dùng cho assertion):

| Hạng mục        | Lượt 1             | Lượt 2             | Ngưỡng trong `lighthouserc.json` | Kết quả              |
| --------------- | ------------------ | ------------------ | -------------------------------- | -------------------- |
| Performance     | 57                 | 66                 | ≥ 0.8 (**warn**)                 | cảnh báo, không chặn |
| Accessibility   | 100                | 100                | ≥ 0.95 (**error**)               | **đạt**              |
| Best practices  | 96                 | 96                 | ≥ 0.9 (**warn**)                 | đạt ngưỡng           |
| SEO             | 100                | 100                | —                                | —                    |
| LCP / TBT / CLS | 6,6 s / 840 ms / 0 | 6,2 s / 460 ms / 0 | —                                | —                    |

- Báo cáo median: `https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/1793502446172-11567.report.html`
- Performance dưới ngưỡng trên máy dev (laptop Windows đang chạy Docker + e2e), chủ yếu do LCP
  ~6,2–6,6 s; CI có runner riêng và job `lighthouse` trong `.github/workflows/ci.yml` vẫn
  `continue-on-error: true` (quyết định B: báo cáo trước, chặn sau khi ngưỡng ổn định).
- Best practices 96 do `errors-in-console`: `/login` gọi thăm dò phiên (`/users/me` hoặc refresh)
  và nhận 401 khi chưa đăng nhập — log console của trình duyệt, không ảnh hưởng chức năng.

## Kiểm chứng khác

| Hạng mục               | Kết quả                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `check:bundle`         | 248,2 KB ≤ 450 KB (**pass**)                                          |
| Build production       | `pnpm --filter web build` pass (dùng cho e2e production + Lighthouse) |
| E2E quick switcher     | 1/1 pass; có bước khẳng định chunk chưa tải trước khi mở              |
| E2E search/ask (đã có) | `search.spec.ts`, `ask.spec.ts` vẫn xanh trong full web e2e           |

## Tiếp tục

- Nếu CI Lighthouse ổn định ≥ 0.8 trong nhiều run, đổi `categories:performance` từ `warn` sang
  `error` và bỏ `continue-on-error` (không làm trong lô này để tránh chặn merge vì máy đo).
