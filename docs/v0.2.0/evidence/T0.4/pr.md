# docs: tạo mẫu evidence, perf, case study và nghiệm thu v0.2.0

## Thay đổi và lý do

Tạo cấu trúc tài liệu theo T0.4, có metadata commit/môi trường/cách chạy và trạng thái chưa đo.
`plan.md` là mục lục; không sao chép hai tài liệu local. Ghi thêm quyết định OWNER hoãn smoke
Claude thật của T0.3, chỉ nghiệm thu phần triển khai hiện tại.

## Kiểm chứng

- [x] Format/docs đạt; lint/typecheck/test/build đạt, ghi rõ cache ở evidence.
- [x] Không thêm test hay đổi runtime; các template không được ghi thành bằng chứng đã chạy.
- [x] Hai tài liệu đầu vào, secret và settings cá nhân không nằm trong commit.
- [ ] PR/CI/review remote chưa thực hiện.

[Bằng chứng](README.md). Rollback chỉ hoàn nguyên tài liệu; không tác động schema hay dữ liệu.
