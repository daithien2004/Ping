# Metrics workflow Claude Code

Cập nhật task: 2026-10-22, T0.3. Đây là trạng thái chuẩn bị trên Codex, chưa phải số liệu dùng
Claude Code thật. Không ghi hoạt động fixture/temp trong test thành số lần chặn thực tế.

- Skills đã viết: 9; agent definitions: 6; commands mới: 4, giữ `/review` hiện có.
- Review bằng subagent Claude thực tế: chưa chạy; số phát hiện: chưa đo.
- ADR mới tới hết T0.2: 1 (ADR-0038 đã được OWNER duyệt).
- PR remote/thời gian task → PR: chưa có PR, chưa đo.
- Smoke `/plan-feature`: chưa chạy bằng Claude Code, OWNER cho hoãn ngày 2026-10-22 vì hiện chỉ
  yêu cầu triển khai, chưa có tài khoản/gói sử dụng. Không ghi thành một lần smoke đã đạt.

**2026-11-11:** 20 ngày sau, smoke trên vẫn chưa từng chạy (0 dòng mới ở bảng dưới ngoài
hook-block, không evidence nào khác). Đã xoá 4 command, 6 agent, 8 skill chưa dùng; giữ hook
(có bằng chứng chạy thật bên dưới) và 2 skill đang được sửa theo việc thật
(`ping-feature-structure`, `ping-wrapper`). Các bullet phía trên giữ nguyên làm bản ghi lịch sử,
không còn đúng với cấu hình hiện tại.

## Hook block thực tế

Hook tự append một dòng cho mỗi lần chặn, chỉ timestamp UTC và reason; tổng số là số dòng
`hook-block` bên dưới. Không dùng phần mô tả này làm một sự kiện.

| Thời điểm UTC            | Loại       | Lý do             |
| ------------------------ | ---------- | ----------------- |
| 2026-11-06T14:38:26.466Z | hook-block | outside-workspace |
| 2026-11-08T18:46:25.447Z | hook-block | outside-workspace |
| 2026-11-08T18:46:41.139Z | hook-block | outside-workspace |
| 2026-11-09T00:57:37.836Z | hook-block | outside-workspace |
| 2026-11-09T00:57:39.797Z | hook-block | outside-workspace |
| 2026-11-09T00:58:18.237Z | hook-block | outside-workspace |
| 2026-11-09T00:58:20.375Z | hook-block | outside-workspace |
| 2026-11-14T02:35:21.042Z | hook-block | outside-workspace |
| 2026-11-14T02:35:22.176Z | hook-block | outside-workspace |
| 2026-11-14T02:35:31.720Z | hook-block | outside-workspace |
| 2026-11-14T02:35:44.022Z | hook-block | outside-workspace |
| 2026-11-14T02:46:37.910Z | hook-block | outside-workspace |
| 2026-11-14T02:46:53.661Z | hook-block | outside-workspace |
| 2026-11-14T02:47:15.996Z | hook-block | outside-workspace |
| 2026-11-14T02:47:22.512Z | hook-block | typecheck-failed  |
| 2026-11-14T02:48:39.644Z | hook-block | outside-workspace |
| 2026-11-14T02:51:10.556Z | hook-block | outside-workspace |
| 2026-11-14T02:51:12.994Z | hook-block | outside-workspace |
| 2026-11-14T02:51:44.036Z | hook-block | outside-workspace |
| 2026-11-14T02:52:29.229Z | hook-block | outside-workspace |
| 2026-11-14T03:11:13.809Z | hook-block | outside-workspace |
