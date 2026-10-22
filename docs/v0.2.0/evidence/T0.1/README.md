# T0.1 — Chốt phạm vi v0.2.0

- Ngày: 2026-10-22 (Asia/Saigon).
- Môi trường: Windows, workspace `D:\discord\Ping`, nhánh `docs/t0.1-release-scope`.
- Runtime: Node `v24.22.0`, pnpm `10.26.0`.
- Base commit: `4dd8e89211b1d7766dda2fb652870a75203a25e5`.
- Thay đổi đang kiểm: worktree chưa commit; kết quả local không phải kết quả CI.
- Đầu ra: [ADR-0038](../../../adr/0038-release-scope-v0.2.0.md),
  [trạng thái](../../status.md), mục 11 project overview local đã đối chiếu phạm vi.
- OWNER cho bắt đầu theo kế hoạch và yêu cầu không commit hai tài liệu đầu vào. OWNER đã duyệt
  bản ADR-0038 cụ thể ngày 2026-10-22 sau khi xem liên kết đề xuất và kết quả kiểm tra T0.1.

## Phạm vi rà soát và dọn dẹp

Đọc hướng dẫn repo, kiến trúc, ADR-0037, ADR UI/chất lượng/tải liên quan, đối chiếu mục 6.2 của
kế hoạch. Giữ emoji tùy chỉnh theo mức [M] và ưu tiên lịch 8 tuần khi các mục mâu thuẫn.

Chỉ dọn output sinh tự động cũ trong `.lighthouseci/` và `apps/web/test-results/`. Giữ file
bàn giao, known issues, báo cáo tải, dữ liệu và secret. Hai tài liệu đầu vào được thêm vào
`.gitignore`, không xóa hay sao chép sang bản version hóa.

## Kiểm chứng

| Lệnh                | Kết quả local                                     | Bằng chứng              |
| ------------------- | ------------------------------------------------- | ----------------------- |
| `pnpm format:check` | Đạt                                               | [Log](format-check.log) |
| `pnpm docs:check`   | Đạt, không có liên kết tương đối hỏng             | [Log](docs-check.log)   |
| `pnpm lint`         | Đạt, chạy mới                                     | [Log](lint.log)         |
| `pnpm typecheck`    | Đạt, chạy mới                                     | [Log](typecheck.log)    |
| `pnpm test`         | 161 test đạt: shared 27, API 38, web 96; chạy mới | [Log](test.log)         |
| `pnpm build`        | Đạt, chạy mới với quyền mạng                      | [Log](build.log)        |

Lần gọi đầu của lint/typecheck/test/build trả cache Turbo. Sau đó chạy lại cả bốn với
`TURBO_FORCE=true`, log cuối xác nhận `0 cached`. Biến này chỉ đặt trong tiến trình kiểm tra,
không đổi cấu hình repo. Chưa kiểm trên một commit mới hay chạy CI; bằng chứng đang ứng với
worktree tài liệu của T0.1 trên base commit nêu trên.

Build trong sandbox không tải được Google Fonts (Geist/Geist Mono):
[log lỗi môi trường](build-sandbox.log). Chạy lại cùng build với quyền mạng thì đạt; không sửa
code app hay bỏ kiểm tra. Các lệnh format/docs được chạy lại sau khi cập nhật tài liệu kết quả.

Lần format file có truyền `.gitignore` báo không suy ra parser; các Markdown vẫn được format.
Kiểm tra `pnpm format:check` toàn repo sau đó đạt; `.gitignore` không cần formatter.

Không thay code app/UI/schema/dependency/container nên không thêm test logic hay chạy lại e2e
và load test trong task tài liệu này. Việc đo baseline mới thuộc T0.6.

## Kết luận

ADR-0038 đã accepted theo xác nhận OWNER ngày 2026-10-22; T0.1 hoàn thành về nội dung và kiểm
chứng local. Commit tài liệu trên nhánh task, không merge, push hay mua tài nguyên. Chưa mở PR
remote; mô tả review có trong [bản nháp PR](pr.md). Mốc kiểm tra gốc và giới hạn CI nêu ở trên.
