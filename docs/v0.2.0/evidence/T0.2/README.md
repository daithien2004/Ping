# T0.2 — Đồng bộ tài liệu phát hành

- Ngày: 2026-10-22 (Asia/Saigon).
- Môi trường: Windows, Node `v24.22.0`, pnpm `10.26.0`.
- Nhánh: `docs/t0.2-sync-release-docs`, nối tiếp T0.1 chưa merge.
- Base commit: `7f0e4ae` (T0.1, ADR-0038 đã được OWNER duyệt).
- Phạm vi kết quả: worktree tài liệu trước commit T0.2, không phải CI remote mới.

## Đối chiếu chênh lệch

| Chênh lệch                                      | Thay đổi                                                                                        | Nguồn đối chiếu                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| README hẹn chọn nơi chạy trước v0.1.0           | Ghi staging thuộc v0.2.0, phân biệt local/staging                                               | ADR-0037, ADR-0038, ADR-0036                    |
| Branch protection còn ở P1 như chưa bật         | Chuyển sang mục đã xác nhận; không truy vấn lại GitHub Settings                                 | Hồ sơ nghiệm thu v0.1.0                         |
| Threat model còn ghi nháp chờ duyệt             | Ghi xác nhận OWNER ngày 2026-10-21; không mô tả là audit độc lập hay duyệt sẵn v0.2.0           | Nghiệm thu v0.1.0, docs index                   |
| Runbook hẹn lịch backup trước v0.1.0            | Ghi staging chưa có lịch/retention ngoài máy; giữ bằng chứng restore local, mục tiêu khác số đo | ADR-0036/0037/0038                              |
| Nghiệm thu trộn mốc H9, `41e8fd4` và commit tag | Tách lịch sử H9/Nginx khỏi mốc phát hành `35a712a`, giữ link CI lịch sử                         | Nghiệm thu hiện có, `git rev-parse 'v0.1.0^{}'` |

Đồng thời sửa trạng thái T0.1 sang đã duyệt trong mục lục/status và ghi commit cụ thể.
Sửa lỗi mã hóa tiếng Việt do truyền script qua PowerShell: dùng UTF-8 và kiểm lại diff trước
commit. Không đổi bằng chứng hiệu năng, triển khai mới hay tuyên bố truy vấn CI/Settings mới.
Hai tài liệu đầu vào local vẫn không commit.

## Kiểm chứng

| Lệnh                | Kết quả                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `pnpm format:check` | Đạt — [log](format-check.log)                                      |
| `pnpm docs:check`   | Đạt — [log](docs-check.log)                                        |
| `pnpm lint`         | Đạt, Turbo cache — [log](lint.log)                                 |
| `pnpm typecheck`    | Đạt, Turbo cache — [log](typecheck.log)                            |
| `pnpm test`         | Đạt, Turbo cache (161 test từ lần chạy mới T0.1) — [log](test.log) |
| `pnpm build`        | Đạt, Turbo cache — [log](build.log)                                |

Đây là thay đổi Markdown; kết quả code được dùng lại theo cache của Turbo từ T0.1, không ghi
thành một lần thực thi test/build mới. Format và docs được chạy lại sau khi chốt tài liệu.
Không thêm test hoặc chạy e2e/load vì không đổi app/UI/schema/hạ tầng. Self-review diff đã
đối chiếu năm chênh lệch trên; PR remote/CI/review CODEOWNERS chưa thực hiện.

## Review và rollback

[Bản nháp PR local](pr.md). Chỉ tài liệu thay đổi; rollback không đổi hành vi ứng dụng. Giữ
bằng chứng cũ đúng môi trường và mốc commit. Không merge hay push trong task này.
