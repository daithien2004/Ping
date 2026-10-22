# T0.5 — Đồng bộ phiên bản trong manifest các package

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/t0.5-manifest-versions`, base commit `90104cc`.
- Task: T0.5 trong `docs/v0.2.0/status.md` (việc [S]).

## Thay đổi

Đồng bộ trường `version` về `0.2.0` trên tất cả manifest package của monorepo, khớp mốc phát hành
v0.2.0 (ADR-0038), thay vì các giá trị lệch nhau trước đây (api `0.0.1`, web `0.1.0`,
shared/eslint-config `0.0.0`, tsconfig không có, root không có).

| Manifest                              | Trước      | Sau     |
| ------------------------------------- | ---------- | ------- |
| `package.json` (root)                 | (không có) | `0.2.0` |
| `apps/api/package.json`               | `0.0.1`    | `0.2.0` |
| `apps/web/package.json`               | `0.1.0`    | `0.2.0` |
| `packages/shared/package.json`        | `0.0.0`    | `0.2.0` |
| `packages/eslint-config/package.json` | `0.0.0`    | `0.2.0` |
| `packages/tsconfig/package.json`      | (không có) | `0.2.0` |

## Kiểm chứng

| Tiêu chí đạt được | Lệnh/cách thức               | Kết quả      | File log |
| ----------------- | ---------------------------- | ------------ | -------- |
| Format            | `pnpm format:check`          | pass         | —        |
| Typecheck         | `pnpm typecheck`             | pass (cache) | —        |
| Docs links        | `pnpm docs:check`            | pass         | —        |
| Build shared      | `pnpm --filter shared build` | pass (cache) | —        |

Không có thay đổi code runtime, không thêm dependency, không thay đổi API/schema.

## Review và rollback

- Không có rủi ro runtime: chỉ metadata manifest. Rollback = revert commit.
- Không cần ADR vì đã chọn hướng "nhất quán" theo task T0.5.
