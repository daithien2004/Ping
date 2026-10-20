## Dự án

Ứng dụng chat realtime kiểu Discord (tên: ping). Monorepo pnpm + Turborepo.

- apps/api: NestJS + PostgreSQL + Prisma + Socket.IO (Redis adapter). Chạy ESM
  (module nodenext, import relative phải có đuôi .js).
- apps/web: Next.js App Router + TanStack Query + Zustand
- packages/shared (@ping/shared): zod schema, type event socket, permission flags
- packages/tsconfig, packages/eslint-config: cấu hình dùng chung

## Lệnh

- Dựng môi trường dev từ đầu bằng một lệnh: `pnpm bootstrap` (cài, `.env`, Docker, migrate, seed; idempotent).
  Không dùng `pnpm setup` (lệnh có sẵn của pnpm). Cài riêng: `pnpm install`
- Dev: `pnpm dev` | Build: `pnpm build`
- Lint/Typecheck/Test: `pnpm lint` / `pnpm typecheck` / `pnpm test`
- E2E web (Playwright, cần Docker; dùng lại dev server nếu đang chạy): `pnpm --filter web test:e2e`
- E2E api: `pnpm --filter api test:e2e` (cần Docker; tự nạp `.env` gốc)
- Dò liên kết hỏng trong tài liệu: `pnpm docs:check` (chạy cả trong CI)
- Format: `pnpm format` (ghi), `pnpm format:check` (chỉ kiểm tra)
- DB: `pnpm db:migrate`, `pnpm db:studio`
- Hạ tầng local: `docker compose up -d`

## Quy tắc kiến trúc (BẮT BUỘC)

1. Backend stateless. Không lưu state dùng chung trong RAM.
2. Postgres là source of truth. Redis chỉ cho pub/sub, presence, rate limit, cache.
3. Ghi dữ liệu qua REST, phát realtime qua gateway sau khi lưu thành công.
4. Mọi type/schema dùng chung nằm trong packages/shared. Không định nghĩa lại.
5. TanStack Query = server state. Zustand = UI state. Không copy server data vào Zustand.
6. Phân trang bằng cursor (id UUIDv7), không dùng offset.
7. Thay đổi DB chỉ qua Prisma migration. Không sửa migration đã merge.
8. Controller mỏng: chỉ parse request, gọi service, trả response. Logic ở service.
9. Mọi endpoint phải có: validate input (zod), guard xác thực, kiểm tra quyền bằng CASL.
   Quy tắc quyền chỉ được định nghĩa trong `defineAbilityFor` (packages/shared). Không viết
   `if (role === ...)` rải rác. Query liệt kê luôn ràng buộc serverId/channelId trong `where`.
10. Không để lộ passwordHash, refresh token, hay lỗi nội bộ ra response.
11. Mọi log phải có requestId (REST) hoặc socketId (socket). Không log mật khẩu, token,
    nội dung tin nhắn. Lỗi trả về client luôn kèm requestId. Hành động nhạy cảm
    (đổi role, kick, xóa tin nhắn của người khác) phải ghi AuditLog.
12. Endpoint tạo dữ liệu mà client có thể retry phải idempotent (nonce/Idempotency-Key).
13. Migration theo expand/contract: không đổi tên/xóa cột trong cùng một lần deploy với code
    đang dùng cột đó. Code phải chạy được với schema của phiên bản liền trước (rolling deploy).
14. Mã lỗi lấy từ danh mục `ErrorCodes` trong packages/shared, không viết chuỗi lỗi tự do.
15. Mỗi quyết định kiến trúc mới hoặc đổi quyết định cũ phải kèm một file trong docs/adr/.
16. Mọi query/endpoint có tham số ID phải có test IDOR (user khác không truy cập được): thêm một
    dòng vào bảng tấn công của `apps/api/test/idor.e2e-spec.ts`.
17. Mọi chỗ gọi Redis trên đường request phải có chính sách khi Redis chết: `failOpen()` hoặc
    ném `redisUnavailable()` (infra/redis/redis-policy.ts, ADR-0026). Lời gọi Postgres/Redis đã có
    timeout; lỗi hạ tầng trả 503, không 500.
18. Endpoint xác thực bằng cookie (hiện: /auth/refresh, /auth/logout) phải có `CsrfGuard` và client
    gửi `X-Ping-Client` (ADR-0027). Header bảo mật/CSP của web nằm trong `next.config.ts`; thay đổi
    phải chạy e2e `security-headers` trên bản build production.
19. Hình dạng response, lỗi, phân trang, trần số lượng và tên event theo `docs/api-conventions.md`
    (checklist ở mục 9); `test/api-conventions.e2e-spec.ts` phải xanh.
20. Trang lỗi của web gọi `reportError()` và hiện mã tham chiếu (`errorReference`); thay đổi UI phải qua
    `e2e/a11y.spec.ts` (axe) và `pnpm --filter web check:bundle` (ngân sách bundle) — ADR-0029.
21. Quan sát (ADR-0031): metrics chỉ ở cổng `METRICS_PORT`, nhãn là mẫu route chứ không phải URL thật;
    lỗi gửi Sentry phải đi qua `scrubEvent`/`scrubBrowserEvent` (không body, cookie, header, nội dung tin
    nhắn) và kèm tag `requestId`. Tính năng mới có hạ tầng phụ thuộc thì thêm vào `dependency_up`.
22. CI/container (ADR-0032): đổi schema thì thêm migration (job `migrations` bắt lệch); đổi Dockerfile hoặc
    compose mẫu thì dựng lại stack và chạy `apps/api/test/smoke/prod-stack.mjs`. Migration chạy bằng target
    `migrate`, không chạy lúc API khởi động. Chạy stack mẫu ở local với `-p pingprod`.

## Cấu trúc code

- Backend: apps/api/src/modules/<domain>/{_.controller,_.service,*.module,...}
- Frontend: apps/web/src/features/<domain>/{api,components,hooks,store}
- Contract: packages/shared/src/{schemas,permissions,events,...}

## Quy ước

- TypeScript strict (packages/tsconfig), không dùng `any` (đã bật rule lint no-explicit-any).
- Test: Vitest. File tên kebab-case. Commit theo Conventional Commits (feat:, fix:, chore:).
- Prettier quyết định định dạng (singleQuote, printWidth 100) — ESLint không cãi Prettier.
- Pre-commit chạy lint-staged (ESLint + Prettier) và `pnpm typecheck`; KHÔNG chạy test/e2e —
  tự chạy `pnpm test` (và e2e khi đổi UI) trước khi commit.

## Frontend (apps/web)

- Phụ thuộc một chiều: `app → features → components → lib` (ESLint chặn). `app/` chỉ định tuyến.
- Page đọc params từ prop `params` của page, KHÔNG `useParams()`: `<Activity>` giữ trang cũ ẩn
  và `useParams()` trong đó trả params của URL hiện tại (ADR-0020). Chỉ component trong layout
  (server rail, channel sidebar, channel redirect) được dùng `useParams()`.
- `<Activity>` giấu chứ không gỡ trang đã rời: state, DOM, giá trị input còn nguyên. Form chứa dữ
  liệu nhạy cảm phải xóa khi ẩn (`useClearOnHide`).
- Dữ liệu server chỉ ghi vào cache trong `features/<domain>/hooks.ts`; logic biến đổi cache là hàm
  thuần trong `*-cache.ts` có test. Component không gọi `queryClient` trực tiếp.
- `useEffect` chỉ để đồng bộ với bên ngoài (cuộn, socket, DOM), không để tính dữ liệu.
- Màu chỉ qua token trong `apps/web/src/app/globals.css` (bg-muted, text-muted-foreground, bg-rail…);
  class màu thô bị ESLint chặn. Component nền tảng dùng shadcn trong `components/ui/`. Chỉ desktop.
- Chữ hiển thị (cả `aria-label`) đi qua `useTranslations`, key thêm vào CẢ `messages/vi.json` và
  `en.json` (test bắt thiếu key). Lỗi: `useErrorMessage()`, không hiện `message` của server.
- Quyền ở UI: chỉ qua ability dựng từ `defineAbilityFor` (`useServerAbility`, `<Can>`); thiếu dữ liệu
  quyền = không cấp gì (ADR-0025). Thao tác bị khóa khi `ready` = false nhưng không gỡ UI/nháp.
- Thay đổi UI: thêm/cập nhật kịch bản Playwright trong `apps/web/e2e/`.

## Cách làm việc

- Với thay đổi lớn: đề xuất kế hoạch ngắn trước, chờ xác nhận rồi mới code.
- Trước khi dùng API của thư viện (Prisma, Next.js, NestJS, TanStack Query),
  kiểm tra docs đúng version đang cài trong package.json.
- Không thêm dependency mới mà chưa nói lý do.
- Khi xong, chạy lint + typecheck + test và báo kết quả.
