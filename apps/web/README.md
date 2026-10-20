# apps/web

Next.js 16 (App Router, `cacheComponents`), React 19, TanStack Query (dữ liệu server), Zustand (trạng thái UI),
shadcn/ui trên Radix, use-intl (tiếng Việt và tiếng Anh). Chỉ hỗ trợ desktop.

Chạy cả dự án: xem [README gốc](../../README.md). Dưới đây chỉ là những thứ riêng của web.

## Cấu trúc (`src/`)

```
app/         chỉ định tuyến (page, layout, error, loading). Không logic.
features/    theo miền: auth, servers, channels, messages, members, permissions, realtime
             mỗi miền: api.ts, hooks.ts (nơi DUY NHẤT ghi dữ liệu server vào cache), *-cache.ts (hàm thuần có test),
             components/
components/  thành phần dùng chung; ui/ là shadcn
lib/         api-client, env, query-keys, báo lỗi (reportError), Sentry (tải lười), tiện ích
```

Phụ thuộc một chiều `app → features → components → lib`, ESLint chặn ngược lại. Ràng buộc chi tiết (không dùng
`useParams()` trong page, màu chỉ qua token, chữ hiển thị qua `useTranslations`…): mục "Frontend" của
[CLAUDE.md](../../CLAUDE.md).

## Lệnh

```bash
pnpm --filter web dev           # chạy dev (pnpm dev ở gốc chạy cả API)
pnpm --filter web test          # test đơn vị (Vitest)
pnpm --filter web test:e2e      # Playwright: tự bật API + web, cần Docker; lần đầu: playwright install chromium
pnpm --filter web check:bundle  # ngân sách JS client (sau pnpm build): tổng ≤ 450 KB gzip, mỗi chunk ≤ 100 KB
```

E2E gồm cả quét accessibility (axe, sáng và tối), bàn phím, header bảo mật/CSP và hai phiên realtime.
Đăng nhập bị giới hạn 10 lần/phút/IP nên e2e dùng `e2e/login-pace.ts` để giãn nhịp.

## Biến môi trường

Next đọc `apps/web/.env*` (không phải `.env` ở gốc). Mẫu: [`.env.example`](.env.example). Mọi biến đi qua
`src/lib/env.ts` (zod); chỗ khác không được đọc `process.env` (ESLint chặn).

| Biến                     | Ý nghĩa                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`    | gốc của API (dev mặc định `http://localhost:4000`). **Nướng vào bundle lúc build.**  |
| `NEXT_PUBLIC_SENTRY_DSN` | trống thì không tải SDK Sentry. Có DSN thì CSP tự mở thêm đúng origin đó (ADR-0031). |

## Ghi chú

- CSP không dùng nonce vì Next 16 yêu cầu render động cho nonce, trái với `cacheComponents` (ADR-0027). Mọi thay đổi
  header/CSP phải chạy e2e `security-headers` trên bản build production.
- `<Activity>` giữ trang đã rời ở dạng ẩn: state và giá trị input còn nguyên (ADR-0020).
