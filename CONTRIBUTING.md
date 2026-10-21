# Đóng góp

Đọc [README](README.md) để chạy được dự án, rồi tới đây. Quy tắc kiến trúc bắt buộc nằm ở [CLAUDE.md](CLAUDE.md) (22 điều +
phần Frontend); file này là quy trình làm việc quanh chúng.

## Quy trình

1. **Thay đổi lớn thì viết kế hoạch ngắn trước** (vấn đề, hướng làm, ảnh hưởng, cách kiểm), chờ đồng ý rồi mới code.
2. **Một nhánh cho một việc**: `feat/<tên>`, `fix/<tên>`, `chore/<tên>`, `docs/<tên>`. Không đẩy thẳng lên `main`.
3. **Viết test trước** cho logic và lỗi: test phải đỏ vì đúng lý do rồi mới sửa cho xanh.
4. **Commit nhỏ, theo Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`; phạm vi tùy chọn như
   `feat(api):`). Pre-commit tự chạy lint-staged (ESLint + Prettier) và `pnpm typecheck`; **không** chạy test: tự chạy.
5. **Quyết định kiến trúc mới, hoặc đổi quyết định cũ → một file trong `docs/adr/`** (đánh số tiếp theo; mẫu: xem các
   ADR gần nhất: Decision, Reason, Alternatives, Consequences).
6. **Kiểm trong trình duyệt thật** và thêm/cập nhật kịch bản Playwright trong `apps/web/e2e/` khi đổi UI, trước khi
   coi việc là xong.
7. **Chạy đủ kiểm tra ở local** (xem mục dưới) trên bản build thật, không chỉ đọc code.
8. **Giải thích thay đổi cho chủ dự án theo vai người triển khai**: từng bước, file nào, vì sao, kiểm thế nào, lỗi gặp
   và cách sửa (tiếng Việt).
9. **Hỏi trước khi merge.** Nếu đồng ý: merge **ở local** bằng `git merge --no-ff`, **không push** khi chưa được bảo,
   rồi xoá nhánh. (Với repo có branch protection: xem mục "Bảo vệ nhánh `main`".)
10. **Lỗ hổng phát hiện mà chưa sửa → ghi vào `docs/known-issues.md`** (ghi chú local, không commit). Nợ đã công bố
    nằm ở [tech-debt](docs/tech-debt.md).
11. **Mở PR** (template tự điền checklist), chờ CI xanh, xin review. Merge bằng merge commit hoặc squash tùy PR; dọn nhánh.

## Trước khi mở PR: chạy gì

Luôn chạy: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

| Nếu bạn đổi…                               | Chạy thêm                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Endpoint hoặc service của API              | `pnpm --filter api test:e2e`; endpoint có ID thì thêm một dòng vào bảng tấn công của `test/idor.e2e-spec.ts`         |
| Hình dạng response, lỗi, phân trang, event | theo [api-conventions](docs/api-conventions.md); `test/api-conventions.e2e-spec.ts` phải xanh                        |
| Quyền (`defineAbilityFor`, role, guard)    | test quyền ở `packages/shared`, `roles-authz` và `idor` e2e; kiểm cả UI ẩn/hiện nút                                  |
| Schema DB                                  | migration mới ([runbook/migrations](docs/runbook/migrations.md)), expand/contract; CI job `migrations`               |
| Chỗ gọi Redis trên đường request           | chính sách khi Redis chết (`failOpen()` hoặc `redisUnavailable()`); test ở `redis-outage.e2e-spec.ts`                |
| Gateway / realtime                         | `pnpm --filter api test:e2e` (realtime) và e2e web; nếu chạm đường nóng thì xem [perf](docs/perf/README.md)          |
| UI (web)                                   | thêm/cập nhật kịch bản Playwright; `pnpm --filter web test:e2e` (gồm axe sáng/tối); `pnpm --filter web check:bundle` |
| Chữ hiển thị                               | thêm key vào **cả** `messages/vi.json` và `en.json` (test bắt thiếu)                                                 |
| Header bảo mật / CSP (`next.config.ts`)    | e2e `security-headers` trên bản build production                                                                     |
| Dockerfile, compose mẫu, CI                | dựng lại stack và chạy `apps/api/test/smoke/prod-stack.mjs` ([ADR-0032](docs/adr/0032-ci-and-containers.md))         |
| Dependency                                 | nêu lý do trong PR (không thêm dependency mới mà chưa nói lý do); ghim phiên bản chính xác; commit `pnpm-lock.yaml`  |

Chạy e2e cần Docker (`docker compose up -d`). `pnpm bootstrap` lo cả việc đó cho lần đầu.

## Điều reviewer sẽ nhìn vào

- Logic ở service, controller mỏng; schema/kiểu dùng chung ở `@ping/shared`, không định nghĩa lại.
- Có kiểm quyền CASL ở backend (UI ẩn nút không thay thế được); truy vấn liệt kê luôn ràng buộc `serverId`/`channelId`.
- Log có `requestId`/`socketId`, **không** log mật khẩu, token, nội dung tin nhắn; lỗi trả về dùng mã trong `ErrorCodes`.
- Migration an toàn khi rolling deploy; không sửa migration đã merge.
- Có test, và test chứng minh được điều nó khẳng định (thử phá code xem test có đỏ không).
- Tài liệu và ADR cập nhật khi hành vi hoặc quyết định đổi.

Muốn một lượt tự review theo đúng danh sách này: trong Claude Code gõ `/review` (xem `.claude/commands/review.md`).

## Vùng nhạy cảm (CODEOWNERS)

Thay đổi ở auth, quyền (`ability`, `permissions`), migration/schema, gateway realtime, CI/Docker và tài liệu bảo mật cần
người có tên trong [`.github/CODEOWNERS`](.github/CODEOWNERS) review. Đây là nơi lỗi gây hậu quả lớn nhất (lộ dữ liệu,
mất dữ liệu, sập khi deploy).

## Bảo vệ nhánh `main` (chỉ chủ repo làm được)

Trên GitHub: Settings → Branches (hoặc Rules → Rulesets) → thêm quy tắc cho `main` (tên menu thay đổi theo phiên bản):

1. **Require a pull request before merging** (tuỳ chọn): bật nếu muốn mọi thay đổi đi qua PR. Repo một chủ có thể **bỏ**
   mục này và vẫn merge local `--no-ff` rồi push, miễn là CI xanh (xem mục Quy trình bước 9). Đã bật hay chưa thì ghi rõ
   trong [acceptance](docs/acceptance/v0.1.0.md).
2. **Require status checks to pass** và chọn các job: `verify`, `api-e2e`, `web-e2e`, `migrations`, `security`
   (`lighthouse` và bước quét Trivy chỉ báo cáo, chưa bắt buộc: [ADR-0032](docs/adr/0032-ci-and-containers.md)).
3. **Require branches to be up to date before merging.**
4. Cấm force-push và xóa nhánh `main`.
5. Review bắt buộc: **Require approvals** và **Require review from Code Owners**, _chỉ khi_ có từ hai người. Repo một
   chủ không tự duyệt PR của chính mình được: bật review bắt buộc sẽ khóa luôn việc merge. Khi đó dựa vào CI xanh +
   tự review bằng `/review`.
6. Thêm tên job vào danh sách chỉ sau khi chúng đã chạy ít nhất một lần (GitHub chỉ cho chọn job đã từng chạy).

## Báo lỗi bảo mật

Đừng mở issue công khai. Liên hệ trực tiếp chủ repo. Mô hình đe dọa và các giả định: [docs/security/threat-model.md](docs/security/threat-model.md).
