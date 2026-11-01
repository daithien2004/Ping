# Case 7 — Quy trình Claude Code có rào chắn

Trạng thái: hoàn thiện tại T7.2 (2026-11-01). Mức độ: ngắn (ADR-0038).

## Bối cảnh, ràng buộc và phương án

Agent viết code trong monorepo có migration, `.env`, token UI và nhiều bề mặt quyền. Lỗi tốn kém
nhất là sửa migration đã merge, rò `antd` ra ngoài `components/ui/`, hoặc tuyên bố "xong" khi
chưa có bằng chứng. Ràng buộc: ADR-0038, **chưa có tài khoản/gói Claude** (OWNER hoãn smoke ngày
2026-10-22), Windows + Git Bash. Đã cân nhắc: (a) để agent tự do rồi review tay; (b) dựng rào chắn
bằng cấu hình + CI + evidence. Chọn (b): permissions/hook, 9 skill, 6 subagent, 5 command, cùng 6
check CI bắt buộc (`verify`, `api-e2e`, `web-e2e-gate`, `visual`, `migrations`, `security`) và
evidence theo task
([CLAUDE.md](../../../CLAUDE.md), [T0.3](../evidence/T0.3/README.md)).

## Quyết định và thiết kế

`CLAUDE.md` và `apps/*/CLAUDE.md` là luật. `.claude/settings.json` allow/deny (`Read`/`Edit`/`Write`
`.env*`, `*.pem`, `*.key`; Bash chỉ các lệnh chuẩn). Hook **PreToolUse** chặn ghi ngoài repo, secret
và migration đã commit trên `main`; **PostToolUse** format; **Stop** typecheck theo package và nhắc
cập nhật status/evidence ([settings](../../../.claude/settings.json)). Mỗi lần hook chặn phải ghi
một dòng `hook-block` vào [metrics](../../claude-workflow/metrics.md). `/plan-feature` chờ duyệt
trước khi sửa; `/ship-task` chạy test-first → code → reviewer + security-reviewer → evidence/PR; MCP
hiện rỗng, chưa bật review CI bằng Claude.

## Bằng chứng (số có thật và phần chưa đo)

- **Cấu trúc:** 68 file ADR (67 accepted, 1 proposed — ADR-0067), 9 skill, 6 agent, 5 command, 3
  hook event ([T0.3](../evidence/T0.3/README.md), commit `765ca79`).
- **Task done:** hơn 65 dòng `done` trong [status](../status.md), mỗi dòng trỏ tới một thư mục
  evidence — evidence là điều kiện "xong", không phải tùy chọn.
- **Hook chặn:** bảng trong [metrics](../../claude-workflow/metrics.md) **trống, 0 dòng** — chưa ghi
  nhận lần chặn thật; không suy ra là "0 lần chặn".
- **Reviewer:** **chưa chạy/chưa đo** số phát hiện (metrics ghi rõ). Cổng tự động thì bắt lỗi thật:
  axe 4 lỗi a11y ở [T6.9](../evidence/T6.9/README.md), 2 lỗi contrast ở
  [T6.7](../evidence/T6.7/README.md) — nhưng đây là gate, không phải số của reviewer.
- **Chu kỳ task:** **chưa đo** thời gian task→PR. Chỉ có nhịp pipeline: web-e2e 3 shard ~10
  phút/shard (`docs/HANDOFF.md`), full web e2e local 27,4 phút ([T6.7](../evidence/T6.7/README.md)).
- **Smoke `/plan-feature` bằng Claude thật:** hoãn, chưa có log; test chỉ kiểm hook process, không
  xác nhận runtime.

## Trade-off, rủi ro

Hook chỉ là guard cho `Edit`/`Write`, **không phải sandbox** cho shell/MCP: lệnh shell vẫn có thể
sửa file mà không phát PostToolUse, nên kiểm diff, permissions, CI và review vẫn bắt buộc. Metrics
mỏng vì chưa chạy Claude thật; "test xanh" không thay review. Rủi ro còn lại: tin vào cấu hình đã
viết mà chưa smoke; hook fail-closed có thể chặn nhầm đường dẫn lạ.

## Nếu làm lại / Nửa frontend

Chạy smoke thật và ghi `claude --version` trước, bật ghi `hook-block` cùng đo số phát hiện/chu kỳ
ngay từ pha đầu; chỉ thêm review CI gắn nhãn `ai-review` khi có ngân sách. Nửa frontend của rào
chắn này là lint theo tầng: cấm import `antd` ngoài `components/ui/`, cấm hex/khoảng cách tùy ý,
`features/*` chỉ dùng `Ping*`; kết quả kiểm được là **0 import `antd` ngoài `components/ui/`** (xem
[case 8](cs-08-frontend-design-system.md)).
