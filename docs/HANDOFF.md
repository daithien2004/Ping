# Bàn giao — ping (cập nhật 2026-10-20)

File này dành cho AI/người tiếp tục dự án khi không có phiên Claude Code trước đó. KHÔNG commit
file này (giống `docs/known-issues.md`). Xóa khi đã bàn giao lại xong.

## 0. Đọc trước khi làm bất cứ gì

1. `CLAUDE.md` (gốc repo) — quy tắc BẮT BUỘC (kiến trúc, frontend, quy ước). Công cụ khác đọc
   `AGENTS.md`: nếu cần, tạo `AGENTS.md` chỉ chứa một dòng "Đọc và tuân theo CLAUDE.md".
2. `docs/adr/0017` → `0023` — các quyết định frontend gần nhất (api-client, auth, app shell,
   tin nhắn, guardrails, i18n, UI kit/token).
3. `docs/known-issues.md` — nợ kỹ thuật chưa xử lý (hiện có O1: thứ tự shutdown Redis/Socket.IO).
4. Hướng dẫn gốc của dự án: `D:\discord\huong-dan-xay-dung-base-discord-clone.md`.

## 1. Trạng thái hiện tại

- Nhánh đang đứng: `main`. F5 ĐÃ merge local bằng `--no-ff` tại `c0c4fbb`, nhánh F5 đã xóa,
  chưa push. Ba commit của F5:
  `b2ab92f` handshake/ACK/room queue + ADR-0024 · `7d2a9cb` frontend realtime ·
  `88b3cf4` E2E + tài liệu F5.
- F4.5 đã merge local vào `main` bằng `--no-ff` tại `d79250e`; nhánh F4.5 đã xóa, chưa push.
- `main` ở local đi trước `origin/main` nhiều commit. Đã push `main` lên origin ngày 2026-10-20 (người dùng cho phép); các lần push sau chỉ khi người dùng bảo, không force-push.
- Lộ trình frontend: F0–F4 ✅ đã merge · pha công cụ (Playwright, lint) ✅ · F4.5 ✅ đã merge ·
  **F5 realtime** ✅ đã merge · F6 quyền ở UI (CASL) + sửa/xóa tin · sau đó hardening backend (hướng dẫn
  bước 11–14) và CI khi bắt đầu push.
- Chỉ hỗ trợ desktop (ADR-0023).

## 2. Chạy dự án

```bash
docker compose up -d                 # Postgres + Redis
pnpm install
pnpm dev                             # api :4000, web :3000
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter web test:e2e           # Playwright, cần docker + dev server (tự bật nếu chưa chạy)
```

- E2E api cần biến môi trường từ `.env` gốc: `set -a; . ./.env; set +a; pnpm --filter api test:e2e`.
- `apps/web/.env.local` có `NEXT_PUBLIC_API_URL=http://localhost:4000`.
- Seed 300 tin để thử cuộn: `pnpm --filter api exec tsx prisma/seed-messages.ts <channelId> <authorId,...> 300`.
- Pre-commit tự chạy lint-staged + `pnpm typecheck`. KHÔNG dùng `--no-verify`.

## 3. Quy trình mỗi pha (người dùng yêu cầu, giữ nguyên)

1. Lên kế hoạch chi tiết (file nào, vì sao, dependency mới kèm lý do + phiên bản), CHỜ người dùng duyệt.
2. Tạo nhánh `feat/<pha>` từ `main`.
3. Viết test trước (đỏ → xanh). Logic phức tạp tách thành hàm thuần có test (vd `message-cache.ts`).
4. Kiểm tra trong trình duyệt thật + kịch bản Playwright trong `apps/web/e2e/`.
5. ADR mới trong `docs/adr/` cho mỗi quyết định.
6. Chạy đủ: lint, typecheck, test, build, e2e web (và e2e api nếu đụng backend).
7. Commit theo Conventional Commits, tách commit hợp lý.
8. Giải thích cho người dùng **theo vai người đang triển khai**: từng bước, file nào, code từng dòng,
   vì sao, kiểm tra thế nào, lỗi gặp và cách sửa. Viết tiếng Việt. Người dùng đang học.
9. Hỏi có merge không. Merge ở local (`git merge --no-ff`), không push, xóa nhánh.
10. Lỗ hổng phát hiện mà chưa sửa → ghi vào `docs/known-issues.md` (không commit).

Dependency mới: phải nói lý do; chọn bản đã phát hành ít nhất 2 tuần, ghim chính xác (`-E`).

## 4. Bẫy đã gặp (đừng lặp lại)

- **`<Activity>` (cacheComponents) giấu trang đã rời, không gỡ.** State/DOM/input còn nguyên.
  - Page lấy params từ prop `params`, KHÔNG `useParams()` (trang ẩn nhận params của URL hiện tại).
    ESLint đã chặn, chỉ 3 component layout được dùng.
  - Form nhạy cảm phải `useClearOnHide()` (mật khẩu từng nằm lại trong DOM).
  - Effect bị cleanup khi trang ẩn, chạy lại khi hiện → join/leave socket theo effect là đúng.
  - Locator Playwright phải lọc phần tử đang hiện (`getByRole`, `.filter({ visible: true })`, `:visible`).
- StrictMode chạy effect 2 lần: việc một-lần đặt trong `requestAnimationFrame` + hủy ở cleanup.
- Đừng cuộn "đoán thời điểm" sau mutate: `onMutate` có `await`, tin optimistic vào cache muộn.
  Đánh dấu ref rồi cuộn trong effect khi `messages.length` đổi.
- Rate limit API 100 req/phút/IP: e2e chạy nối tiếp trên một trang, `workers: 1`.
- Flat config ESLint: khối sau GHI ĐÈ cùng rule của khối trước. Trong template literal `\b` là
  backspace → viết `\\b`.
- `shadcn init/add` cài bản MỚI NHẤT → ghim lại version sau khi chạy.
- Màu chỉ qua token `apps/web/src/app/globals.css`; class màu thô bị lint chặn.
- Chữ hiển thị (kể cả `aria-label`) qua `useTranslations`; thêm key vào CẢ `vi.json` và `en.json`.
- api là ESM (nodenext): import relative phải có đuôi `.js`.
- Windows: đường dẫn có dấu nháy đơn (`THIEN'PC`); lint-staged có thể báo CRLF.

## 5. Việc tiếp theo

### 5.1 Tiếp theo: lên kế hoạch chi tiết F6 và chờ người dùng duyệt trước khi code.

### 5.2 F5 — Đã triển khai theo kế hoạch người dùng duyệt

- Đọc ADR-0024 để hiểu code hiện tại. Ghi chú thiết kế bên dưới
  là bản gợi ý ban đầu; ADR-0024 ghi quyết định thực tế, bao gồm ACK, auth middleware, cache tombstone.
- Kiểm tra đã qua: lint, typecheck, 89 unit test, build, 66 E2E API và 8 E2E web Chromium.
- Người dùng chọn để UI thành viên/presence sang pha riêng. F6 vẫn cần kế hoạch chi tiết và chờ duyệt.
- Phát hiện O2: access log chưa redact response Set-Cookie; đã ghi known-issues, chưa sửa.
- Chromium setOffline có thể giữ WS cũ: E2E dùng routeWebSocket chuyển tiếp server thật và đóng
  bridge khi offline. Không thêm mock/hook phục vụ test vào code production.

#### Gợi ý thiết kế ban đầu (lưu để đối chiếu, không phải việc chưa làm)

Đọc trước: `packages/shared/src/events.ts` (ServerEvents, ClientEvents, payload types),
`apps/api/src/modules/realtime/` (gateway: cách xác thực handshake, room `user:/server:/channel:`),
`docs/adr/0006-realtime-authorization-and-presence.md`, hướng dẫn mục 12.

Gợi ý thiết kế (cần kiểm chứng với code thật):

- `features/realtime/socket.ts`: `io(NEXT_PUBLIC_API_URL, { auth: (cb) => cb({ token: getAccessToken() }) })`
  với type `Socket<ServerToClientEvents, ClientToServerEvents>` từ `@ping/shared`
  (`socket.io-client` 4.8.4 đã cài). Dạng `auth` là hàm để lần reconnect lấy token mới.
- Kết nối sống trong vùng đã đăng nhập (dưới `AuthGate`), ngắt khi đăng xuất.
- `message.created` → `upsertMessage` vào `qk.messages(channelId)` (đã khớp theo nonce, không trùng
  với response HTTP). Thêm hàm thuần cho `message.updated` / `message.deleted` trong
  `message-cache.ts` + test.
- `channel.join` / `channel.leave` trong effect của `MessagePane`.
- Reconnect → `invalidateQueries` tin của các channel đang mở (bù event bị lỡ).
- `permissions.changed` → invalidate server/channels; `member.removed` (chính mình) → xóa query của
  server đó, về `/`.
- Typing: emit có throttle (~3s) khi gõ ở `MessageComposer`; hiện "X đang gõ…" (i18n, số nhiều).
- **Zustand** (dependency mới, hướng dẫn 12.4, CLAUDE.md rule 5): chỉ UI state — trạng thái kết nối,
  ai đang gõ theo channel. KHÔNG copy tin nhắn/server vào Zustand.
- Banner mất kết nối (i18n, token màu).
- Presence: backend có `presence.updated` nhưng web chưa có danh sách thành viên → hỏi người dùng có
  làm UI thành viên ở F5 không.
- E2E: hai `browser.newContext()` — A gửi, B thấy không cần reload; typing; `context.setOffline(true)`
  → banner, online lại → nhận tin bị lỡ.
- ADR-0024.

### 5.3 Sau F5

- F6: CASL ở UI (`defineAbilityFor` trong `@ping/shared`), ẩn nút theo quyền, sửa/xóa tin (chuyển
  `updateMessageSchema` vào shared nếu chưa), dropdown-menu của shadcn. Lưu ý dev indicator của
  Next nằm góc trên-phải header channel (chỉ ở dev).
- Hardening backend + sửa O1 trong known-issues. CI GitHub Actions khi bắt đầu push.

## 6. Không được làm

Push khi người dùng chưa bảo · thêm dependency không nói lý do · commit `docs/known-issues.md`, `docs/HANDOFF.md`,
`.claude/` · sửa migration đã merge · `any` · màu thô · chuỗi giao diện viết cứng · bỏ qua hook commit ·
gộp nhiều pha vào một nhánh · code trước khi người dùng duyệt kế hoạch.

## 7. Tiến độ hoàn thiện (theo hướng dẫn bước 11–14)

Thứ tự đã duyệt: H1 độ bền khi hạ tầng hỏng + graceful shutdown ✅ (nhánh `feat/hardening-h1`, chờ merge,
ADR-0026) · H2 bảo mật chiều sâu (CSRF refresh, CSP/headers, khóa đăng nhập sai, chống flood, test IDOR
cho 19 endpoint có ID, threat model, sửa O2) · H3 quy ước API · H4 frontend bền vững · H10 UI thành viên/
presence (cần endpoint snapshot) · H5 observability (Sentry để trống DSN) · H6 CI/Docker (viết sẵn, chưa
push) · H7 load test · H8 tài liệu/README · H9 cổng nghiệm thu rồi tag v0.1.0.
Quy tắc mới: CLAUDE.md quy tắc 17 (mọi lời gọi Redis trên đường request phải có chính sách khi Redis chết).
