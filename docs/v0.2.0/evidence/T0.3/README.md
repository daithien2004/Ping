# T0.3 — Workflow Claude Code

- Ngày: 2026-10-22 (Asia/Saigon); Windows, Node `v24.22.0`, pnpm `10.26.0`.
- Base commit: `dc28d10` (T0.2), nhánh `chore/t0.3-claude-workflow`.
- Worktree đang triển khai, chưa commit/merge/push và chưa chạy CI remote.
- Đầu ra: [hướng dẫn workflow](../../../claude-workflow/README.md), package CLAUDE.md,
  9 skills, 6 agent definitions, 4 commands mới, settings/hooks và mẫu MCP chưa có server.

## Test-first

[Test đỏ](test-red.log): skeleton cho phép mọi write, test chặn secret/migration/ngoài workspace
và chọn package thất bại đúng vì thiếu chính sách. Sau implementation:
[test xanh](test-green.log), có cả JSON protocol, metric không ghi tool content, Stop recursion
và format bằng Prettier thật. Fixtures chỉ nằm trong thư mục temp của test.

## Bộ kiểm local

| Lệnh                | Kết quả                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm format:check` | Đạt — [log](format-check.log)                                                              |
| `pnpm docs:check`   | Đạt — [log](docs-check.log)                                                                |
| `pnpm lint`         | Đạt, gồm lint hooks mới; Turbo 1/3 cached — [log](lint.log)                                |
| `pnpm typecheck`    | Đạt; Turbo 2/4 cached — [log](typecheck.log)                                               |
| `pnpm test`         | 27 workflow + 161 app/shared test đạt; Turbo 2/4 cached — [log](test.log)                  |
| `pnpm build`        | Đạt, dùng quyền mạng tải font; Turbo 1/3 cached — [log](build.log)                         |
| Parse JSON/kiểm kê  | Có 3 hook event, 9 skill, 6 agent; không coi là xác nhận runtime — [log](config-check.log) |

Format/docs được chạy lại sau khi chốt tài liệu bằng chứng. Không thêm dependency; lint/test
hooks được nối vào các lệnh gốc, vì vậy job verify hiện có sẽ chạy chúng mà không cần sửa CI.
Các test riêng dùng real Node process, Prettier, Git fixture và pnpm giả lập để kiểm Stop chọn
package/nhận lỗi; không dùng DB hoặc secret thật. Self-review đã sửa resolve root, cách gọi pnpm
trên Windows, import Node globals cho lint và an toàn đường dẫn metrics.

Không đổi code app/UI/schema/container nên không chạy lại e2e hay smoke stack. Chưa chạy
review bằng subagent Claude; [bản nháp PR](pr.md) ghi phần còn chờ và rủi ro.

## Phần còn chờ để hoàn thành

Chưa tìm thấy `claude` trên PATH của phiên. Cần CLI/runtime hợp lệ để kiểm settings/subagents,
chạy `/plan-feature DEMO-WORKFLOW` và lưu log thật theo [checklist](../../../claude-workflow/examples.md).
Không tự cài dịch vụ, dùng key cá nhân hay gọi model trả phí. Chưa kết nối MCP/GitHub AI review,
không mô tả cấu hình rỗng như kết nối đã chạy.

UI lint tương lai được triển khai ở TF.1–TF.3 cùng ADR UI; không đổi shadcn/token hiện tại ở T0.3.
Không đánh dấu T0.3 done chỉ vì tests hoặc file cấu hình đã tồn tại.
