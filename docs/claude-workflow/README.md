# Workflow Claude Code của Ping

T0.3 chuẩn bị cấu hình project cho Claude Code, theo ADR-0038. Các file này không tự trở thành
hooks/subagents của Codex. Đọc [CLAUDE.md gốc](../../CLAUDE.md) và
[CONTRIBUTING](../../CONTRIBUTING.md); hướng dẫn package nằm trong
[API](../../apps/api/CLAUDE.md) và [web](../../apps/web/CLAUDE.md).

## Cấu hình và cách dùng

| Thành phần                | Nơi lưu                     | Cách kiểm                                                         |
| ------------------------- | --------------------------- | ----------------------------------------------------------------- |
| Permissions/hooks project | `.claude/settings.json`     | `/permissions`, `/hooks` trong Claude Code                        |
| Skills                    | `.claude/skills/*/SKILL.md` | 9 skill theo các loại task của plan                               |
| Subagents                 | `.claude/agents/*.md`       | 6 vai trò; không pin model, dùng model của phiên                  |
| Commands                  | `.claude/commands/`         | `/plan-feature`, `/ship-task`, `/drill`, `/case-study`, `/review` |
| Hook scripts/tests        | `.claude/hooks/`            | `pnpm test:workflow`, cũng nằm trong `pnpm test`                  |
| MCP                       | `.mcp.json`                 | Hiện rỗng; chưa kết nối dịch vụ hay có secret                     |
| Metrics                   | [metrics.md](metrics.md)    | Chỉ ghi sau task/pha và khi hook chặn                             |

Yêu cầu máy: Node/pnpm theo repo, Git và Claude Code đã cài/đăng nhập. Hook command dùng shell
mặc định tương thích cú pháp `$CLAUDE_PROJECT_DIR`; Windows cần Git Bash trong cấu hình Claude.
Không đổi `.claude/launch.json` hay settings cá nhân. Cấu hình chung được commit, settings.local
và tài liệu đầu vào kế hoạch/overview giữ local theo yêu cầu OWNER.

Khởi động Claude Code tại gốc repo, kiểm cấu hình đã load bằng `/hooks`, `/permissions` và
`/agents`, sau đó chạy `/plan-feature DEMO-WORKFLOW`. Command thử chỉ đọc và lập kế hoạch,
không sửa code. Log cần có version CLI, ngày, nội dung kế hoạch và xác nhận không đổi worktree.
Không gọi headless/model hoặc cài dịch vụ trả phí khi chưa có tài khoản/quyền được phép.

Ví dụ prompt và tiêu chí smoke: [examples.md](examples.md).
Theo dõi phần đã kiểm và phần còn chờ trong [evidence T0.3](../v0.2.0/evidence/T0.3/README.md).
OWNER đã điều chỉnh phạm vi ngày 2026-10-22: hiện chỉ triển khai và kiểm thử local, hoãn smoke
Claude thật vì chưa có tài khoản/gói sử dụng. T0.3 được đóng cho phần triển khai theo điều chỉnh
này; smoke vẫn chưa chạy và phải thực hiện trước khi tuyên bố tương thích runtime Claude.

## Hook và giới hạn

- PreToolUse cho Edit/Write kiểm đường dẫn lexical và canonical, chặn ghi ngoài repo,
  `.env*`, khóa thường gặp, `.git` và mọi file trong thư mục migration đã commit trên main.
  Không đọc được main thì chặn migration mới, không chặn source thông thường.
- Hook không trả auto-allow cho file hợp lệ: hệ thống permissions của Claude vẫn quyết định.
  Các agent test-first/doc-sync có hook thêm để giới hạn thư mục ghi. Agent review không có
  tool ghi/shell; ui-reviewer đọc ảnh do orchestrator chụp, không tự cập nhật baseline.
- PostToolUse format file vừa sửa bằng Prettier local, giữ file bị ignore và không tự stage.
  Stop chạy typecheck các package có thay đổi worktree/untracked; shared/config chung chọn cả
  shared/api/web. Tác vụ chỉ đổi docs gốc không cần typecheck package. Hook nhắc cập nhật
  status/evidence sau task, không ép lưu thêm theo từng lượt chat.
- Typecheck lỗi/timeout thì Stop báo block; lần tiếp theo có `stop_hook_active` bỏ qua để tránh
  vòng lặp vô hạn. Agent vẫn phải sửa hoặc báo kết quả chưa đạt, không ghi task done.
- Hook ghi lý do chặn và UTC timestamp vào metrics; không ghi tool content, token hay đường dẫn
  secret. Tests dùng fixture/temp, không đọc/ghi secret hoặc migration thật.

Đây là guard cho Edit/Write, **không phải sandbox cho mọi shell/MCP/process**. Lệnh shell có
thể sửa file mà không phát PostToolUse tương ứng; kiểm diff, permissions, migration CI và review
vẫn bắt buộc. Không dùng `bypassPermissions`, không thêm wildcard allow cho shell.

Lint UI hiện tại vẫn theo ADR-0023. Quy tắc antd/Ping*, token mới và kiểm CSS sẽ được áp dụng
cùng TF.1–TF.3 sau ADR/spike; không dùng T0.3 để thay quyết định UI chưa duyệt.

## MCP và review CI

`.mcp.json` chưa khai báo server để tránh tự cài package/chạy service hoặc đưa secret vào repo.
Khi có tài nguyên được phép, cấu hình Postgres local/staging bằng tài khoản chỉ đọc và transaction
read-only; GitHub giới hạn repo/task; Playwright trên local/staging với dữ liệu demo. Secret lấy
từ biến môi trường/config cá nhân ngoài repo. Kiểm quyền thực tế trước khi ghi đã kết nối.

Chưa thêm workflow Claude review đang hoạt động, chưa có API key hoặc kết quả CI AI.
Thiết kế workflow khi bật: chỉ PR cùng repo có nhãn `ai-review`, không dùng
`pull_request_target` để checkout code không tin cậy với secret; có timeout/giới hạn lượt,
quyền repo tối thiểu, key trong GitHub Secrets, kiểm chi phí và đối chiếu tài liệu chính thức.
Không gắn nhãn, gọi API hoặc đăng review chỉ vì file cấu hình đã có.

## Tài liệu chính thức đã đối chiếu

Ngày kiểm: 2026-10-22. Phiên bản CLI thực tế vẫn cần ghi khi có máy chạy smoke.

- Cấu hình settings project và schema: [Settings](https://code.claude.com/docs/en/settings),
  [Permissions](https://code.claude.com/docs/en/permissions).
- Input stdin, deny JSON, timeout và Stop recursion:
  [Hooks reference](https://code.claude.com/docs/en/hooks).
- Frontmatter và command: [Skills](https://code.claude.com/docs/en/skills).
- Tool allowlist và hook theo agent: [Subagents](https://code.claude.com/docs/en/sub-agents).
- Project scope và phê duyệt kết nối: [MCP](https://code.claude.com/docs/en/mcp).
- Review tự động khi có quyền/tài khoản:
  [GitHub Actions](https://code.claude.com/docs/en/github-actions).
