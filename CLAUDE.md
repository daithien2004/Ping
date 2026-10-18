## Dự án

Ứng dụng chat realtime kiểu Discord (tên: ping). Monorepo pnpm + Turborepo.

- apps/api: NestJS + PostgreSQL + Prisma + Socket.IO (Redis adapter). Chạy ESM
  (module nodenext, import relative phải có đuôi .js).
- apps/web: Next.js App Router + TanStack Query + Zustand
- packages/shared (@ping/shared): zod schema, type event socket, permission flags
- packages/tsconfig, packages/eslint-config: cấu hình dùng chung

## Lệnh

- Cài đặt: `pnpm install`
- Dev: `pnpm dev` | Build: `pnpm build`
- Lint/Typecheck/Test: `pnpm lint` / `pnpm typecheck` / `pnpm test`
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
16. Mọi query/endpoint có tham số ID phải có test IDOR (user khác không truy cập được).

## Cấu trúc code

- Backend: apps/api/src/modules/<domain>/{_.controller,_.service,*.module,...}
- Frontend: apps/web/src/features/<domain>/{api,components,hooks,store}
- Contract: packages/shared/src/{schemas,permissions,events,...}

## Quy ước

- TypeScript strict (packages/tsconfig), không dùng `any` (đã bật rule lint no-explicit-any).
- Test: Vitest. File tên kebab-case. Commit theo Conventional Commits (feat:, fix:, chore:).
- Prettier quyết định định dạng (singleQuote, printWidth 100) — ESLint không cãi Prettier.
- Trước khi commit: chạy `pnpm lint` + `pnpm typecheck` (hook pre-commit chỉ lo
  ESLint + Prettier, KHÔNG chạy typecheck/test — đừng chủ quan).

## Cách làm việc

- Với thay đổi lớn: đề xuất kế hoạch ngắn trước, chờ xác nhận rồi mới code.
- Trước khi dùng API của thư viện (Prisma, Next.js, NestJS, TanStack Query),
  kiểm tra docs đúng version đang cài trong package.json.
- Không thêm dependency mới mà chưa nói lý do.
- Khi xong, chạy lint + typecheck + test và báo kết quả.
