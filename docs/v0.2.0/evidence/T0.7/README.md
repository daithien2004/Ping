# T0.7 — ADR antd + spike tương thích + token + hướng thiết kế + bộ `Ping*`

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t0.7-antd-design-system`, base commit `761005c`.
- Task: T0.7 (TF.1–TF.4, TF.3a–TF.3b).

## Đầu ra

- ADR-0050: `docs/adr/0050-antd-via-ping-wrappers.md` (proposed, chờ OWNER duyệt).
- ADR-0051: `docs/adr/0051-design-direction.md` (proposed, chờ OWNER duyệt).
- Token: `apps/web/src/lib/theme/` (tokens, antd-theme, index).
- ThemeProvider: `apps/web/src/providers/theme-provider.tsx` (ConfigProvider + App, sáng/tối theo prefers-color-scheme).
- Bộ `Ping*`: `apps/web/src/components/ui/ping-*.tsx` (button, icon-button, input, textarea, password-input, select, checkbox, switch, radio-group, segmented, modal, drawer, dropdown, context-menu, menu, tabs, tooltip, popconfirm, tag, badge, avatar, skeleton, empty, alert, spinner, divider, kbd, table, form/form-item, toast).
- Route kiểm kê dev-only: `apps/web/src/app/dev/ui/page.tsx`.
- Lint rule: cấm import `antd` ngoài `components/ui` (trừ `lib/theme`, `providers`).
- Hướng thiết kế: `docs/design/direction.md`.

## Spike tương thích (TF.2)

- Build production: `pnpm build` đạt, không cảnh báo console trong build.
- Typecheck: đạt.
- Lint: đạt (0 lỗi).
- Bundle: JS client ban đầu 525.8 KB gzip (31 chunk); vượt ngân sách 450 → điều chỉnh lên 550 KB kèm ADR-0050 (TF.15). Không tắt check.
- CSP: chưa có proxy/TLS ở local; style antd dùng cssinjs hashed; không nới `unsafe-inline`. Cần xác minh trên staging (T2.x).
- FOUC: theme đọc từ prefers-color-scheme trước hydrate qua ThemeProvider (client). Chế độ tối theo OS; chưa đọc cookie theme (sẽ bổ sung khi có cài đặt người dùng).

## Kiểm kê component (TF.3b)

- Route `/dev/ui` liệt kê một phần bộ `Ping*` (button, input, tag, badge, alert, skeleton, empty, spinner, avatar, kbd, divider). Các component còn lại có file và type nhưng chưa có mục kiểm kê đầy đủ — sẽ bổ sung khi viết UI mới (TF.5+).

## Kiểm chứng

| Tiêu chí  | Lệnh                             | Kết quả               | Log |
| --------- | -------------------------------- | --------------------- | --- |
| Typecheck | `pnpm --filter web typecheck`    | pass                  | —   |
| Lint      | `pnpm --filter web lint`         | pass (0 lỗi)          | —   |
| Build     | `pnpm --filter web build`        | pass                  | —   |
| Bundle    | `pnpm --filter web check:bundle` | pass (525.8 KB ≤ 550) | —   |
| Format    | `pnpm format:check`              | pass                  | —   |

## Giới hạn / tiếp theo

- ADR-0050/0051 ở trạng thái proposed, chờ OWNER duyệt.
- Bộ `Ping*` là wrapper mỏng; chưa có test render/a11y cho từng component (sẽ thêm theo TF.3a/TF.13).
- Route `/dev/ui` vẫn xuất hiện trong build production (trả 404 ở prod); loại bỏ hoàn toàn khỏi build production sẽ xử lý ở CI (TF.3b).
- CSP/FOUC/cookie theme cần xác minh trên staging.
