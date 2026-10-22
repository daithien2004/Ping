# Evidence `<task-id>` — `<mô tả>`

Mẫu chưa có kết quả; sao chép vào thư mục task rồi điền bằng chứng thật.

- Ngày/múi giờ:
- Người thực hiện/review:
- Task, nhánh và PR (hoặc nháp local):
- Commit nguồn/code được kiểm; commit chứa bằng chứng nếu khác:
- Môi trường, runtime, image/SHA, cấu hình liên quan không chứa secret:
- Phụ thuộc, phạm vi và thiết kế/ADR đã được duyệt:

## Thay đổi và kiểm chứng

| Tiêu chí đạt                | Lệnh/cách thử       | Kết quả (`pass`/`fail`/`not-run`) | File log/ảnh/số đo |
| --------------------------- | ------------------- | --------------------------------- | ------------------ |
| Điền tiêu chí quan sát được | Điền lệnh chính xác | not-run                           | Chưa có            |

Logic/lỗi: ghi test đỏ đúng lý do, rồi kết quả xanh. Đánh dấu cache nếu có; không lấy log cũ làm
lần chạy mới. Nếu không chạy e2e/drill/load thì ghi lý do. Không dán token, prompt hoặc nội dung tin.

## Review, giới hạn và tiếp tục

- Phát hiện, mức độ, cách sửa hoặc lý do chưa sửa:
- Điều chưa đo/kiểm; thiếu tài nguyên/quyền/runtime:
- Rollout/rollback và rủi ro:
- Cách chạy lại, trạng thái cuối, bước tiếp theo:

Cập nhật status sau task. Không dùng riêng việc có file log làm bằng chứng tiêu chí đã đạt.
