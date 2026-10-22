# docs: chốt phạm vi Ping v0.2.0 trong 8 tuần

## Thay đổi gì và vì sao

Ghi phạm vi đã được OWNER duyệt vào ADR-0038, bao gồm tải pilot, RPO/RTO, ngân sách và mức
rút gọn cho lịch 8 tuần. Tạo status/evidence ban đầu, liên kết từ mục lục và loại hai tài liệu
đầu vào local khỏi commit theo yêu cầu OWNER. Không thay code ứng dụng hoặc hạ tầng.

## Cách đã kiểm chứng

- [x] Format, docs, lint, typecheck, 161 unit test và build production đạt local.
- [x] OWNER duyệt ADR-0038 ngày 2026-10-22.
- [x] Giữ hai tài liệu đầu vào ngoài Git; không thêm dependency, endpoint hay migration.
- E2E/IDOR/a11y không áp dụng cho thay đổi tài liệu này. CI remote chưa chạy.
- Log và môi trường: [bằng chứng T0.1](README.md).

## Rủi ro và cách quay lại

Lịch vẫn chặt, nhà cung cấp chưa chọn và chưa có bằng chứng staging. Đổi phạm vi cần ADR;
rollback thay đổi này chỉ tác động tài liệu và ignore rule. Không chứa secret hay dữ liệu thử.

Đây là bản nháp local để review, chưa phải PR đã mở trên GitHub.
