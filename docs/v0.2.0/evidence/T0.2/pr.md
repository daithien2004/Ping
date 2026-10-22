# docs: đồng bộ hồ sơ v0.1.0 và công việc staging v0.2.0

## Thay đổi gì và vì sao

README và runbook vẫn hẹn staging/backup trước v0.1.0, threat model còn ghi nháp, và branch
protection nằm ở P1 dù hồ sơ đã xác nhận hoàn tất. Đồng bộ năm nơi này theo ADR-0037/0038 và
nghiệm thu; tách CI H9/Nginx khỏi commit tag `35a712a`, giữ nguyên bằng chứng lịch sử.

## Checklist và kiểm chứng

- [x] Format/docs đạt; lint/typecheck/test/build đạt với cache từ code không đổi.
- [x] Đối chiếu năm chênh lệch; Git local xác nhận commit tag.
- [x] Không thêm dependency, logic, endpoint, migration hoặc UI; test/e2e bổ sung không áp dụng.
- [x] Không stage tài liệu đầu vào local, secret hoặc file cấu hình cá nhân.
- [ ] CI remote và review CODEOWNERS cho tài liệu bảo mật: chưa chạy, chưa có review mới.

[Bằng chứng](README.md). Bản nháp local này chưa được đăng lên GitHub.

## Rủi ro và cách quay lại

Không ảnh hưởng runtime. Tài liệu ghi lại xác nhận CI/branch protection từ hồ sơ, không tuyên bố
truy vấn lại dịch vụ. Revert commit tài liệu nếu cần; không có dữ liệu hay schema phải khôi phục.
