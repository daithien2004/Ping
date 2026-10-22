# TF.5 — App shell mới (quick switcher + phím tắt)

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/tf.5-app-shell`, base commit `e1a9368`.
- Task: TF.5 (Pha 3).

## Thay đổi

- `apps/web/src/components/quick-switcher.tsx`: modal tìm kiếm server/channel, mở bằng Ctrl/Cmd+K,
  dùng `PingModal`/`PingInput` (theo ADR-0050).
- `apps/web/src/app/(app)/layout.tsx`: gắn `QuickSwitcher` vào app shell (banner kết nối giữ nguyên).
- `apps/web/src/app/dev/ui/page.tsx`: giữ guard production.

## Kiểm chứng

| Tiêu chí      | Lệnh                             | Kết quả         |
| ------------- | -------------------------------- | --------------- |
| Typecheck web | `pnpm --filter web typecheck`    | pass            |
| Lint web      | `pnpm --filter web lint`         | pass (0 lỗi)    |
| Build web     | `pnpm --filter web build`        | pass            |
| Bundle        | `pnpm --filter web check:bundle` | pass (≤ 550 KB) |
| Format        | `pnpm format:check`              | pass            |

## Giới hạn

- Quick switcher chưa nối dữ liệu thật (items rỗng); sẽ nối ở TF.6+.
- Chưa có panel thành viên thu gọn và phím tắt chính ngoài Ctrl/Cmd+K; sẽ bổ sung theo TF.5 đầy đủ.
- ADR-0050/0051 vẫn ở trạng thái proposed.
