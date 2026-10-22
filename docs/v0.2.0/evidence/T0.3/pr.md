# chore: chuẩn bị workflow Claude Code cho Ping

## Thay đổi gì và vì sao

Tạo hướng dẫn phân tầng, 9 skills, 6 agent definitions, commands lập kế hoạch/thực thi/drill/
case study và hooks bảo vệ migration/secret, format, typecheck. Lint/test hooks được chạy trong
`pnpm lint`/`pnpm test`, dùng dependency hiện có. Không đổi runtime ứng dụng hoặc UI framework.

## Kiểm chứng

- [x] Test-first: chính sách chưa có thì test đỏ; sau đó 27 workflow test đạt.
- [x] Format/docs/lint/typecheck/test/build đạt tại local; tổng 188 test, một phần dùng cache.
- [x] Kiểm kê JSON: 3 hook event, 9 skill, 6 agent; các command có frontmatter parse được bằng Prettier.
- [x] Không thêm dependency, secret, key hay tài liệu đầu vào local vào commit.
- [ ] Claude Code thật nhận cấu hình, chạy `/plan-feature DEMO-WORKFLOW`: chưa có runtime.
- [ ] MCP và CI AI review: chưa kết nối/bật, không có tài khoản/key hoặc kết quả thực tế.
- [ ] PR remote và CI/review remote: chưa thực hiện.

[Bằng chứng local và phần hoãn](README.md). OWNER điều chỉnh ngày 2026-10-22: hoàn thành phần
triển khai hiện tại, hoãn smoke Claude thật vì chưa có tài khoản/gói sử dụng. Đây là bản nháp
local; không coi điều chỉnh phạm vi là log runtime đã đạt.

## Rủi ro và rollback

Hooks Edit/Write không kiểm mọi shell/MCP/process; không thay sandbox hay review/migration CI.
Stop có chống lặp, test package theo worktree hiện tại và timeout. Cần xác nhận runtime Claude
thực tế, đặc biệt shell Git Bash trên Windows. Gỡ settings/hooks và hoàn nguyên script lint/test
nếu cần rollback; không có migration hoặc dữ liệu ứng dụng thay đổi.
