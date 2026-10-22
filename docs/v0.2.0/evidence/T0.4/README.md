# T0.4 — Cấu trúc tài liệu thực thi

- Ngày: 2026-10-22 (Asia/Saigon), Windows/Node `v24.22.0`/pnpm `10.26.0`.
- Nhánh: `docs/t0.4-task-artifacts`, base `765ca79` (triển khai T0.3).
- Đầu ra: [điểm vào](../../plan.md), [mẫu evidence](../template.md),
  [case studies](../../case-studies/README.md), [perf](../../perf/README.md),
  [nghiệm thu](../../acceptance/v0.2.0.md), cùng status và các thư mục task đã có.
- `plan.md` chỉ là mục lục, không sao chép kế hoạch local. Hai tài liệu đầu vào vẫn ngoài commit.

Các mẫu ghi rõ chưa có kết quả, chưa phải case study/load test/biên bản nghiệm thu đã đạt.
Trong phiên T0.4, OWNER điều chỉnh T0.3 thành hoàn thành phần triển khai, hoãn smoke Claude thật
do chưa có tài khoản/gói sử dụng. Đã ghi điều chỉnh ở status, hướng dẫn và evidence T0.3.

## Kiểm chứng

| Lệnh                | Kết quả                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `pnpm format:check` | Đạt — [log](format-check.log)                                               |
| `pnpm docs:check`   | Đạt — [log](docs-check.log)                                                 |
| `pnpm lint`         | Hooks chạy; phần app/shared dùng Turbo cache — [log](lint.log)              |
| `pnpm typecheck`    | Đạt, Turbo cache — [log](typecheck.log)                                     |
| `pnpm test`         | 27 workflow test chạy mới, 161 app/shared test dùng cache — [log](test.log) |
| `pnpm build`        | Đạt, Turbo cache — [log](build.log)                                         |

Format/docs chạy lại sau khi chốt mẫu và ghi nhận điều chỉnh. Không thay code ứng dụng/hạ tầng,
không thêm test/e2e/load. Cấu trúc thư mục được Git theo dõi bằng file mẫu, không cần `.gitkeep`.

## Review và rollback

[Bản nháp PR local](pr.md). Tài liệu không dẫn link bắt buộc tới file local bị ignore; các mẫu
không ghi số đo/CI/staging/pilot giả. Rollback chỉ ảnh hưởng tài liệu, không dữ liệu ứng dụng.
