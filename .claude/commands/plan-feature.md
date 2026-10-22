---
description: Lập thiết kế và test cho một task Ping; chỉ đọc, chờ OWNER duyệt trước khi code
argument-hint: '<task-id hoặc DEMO-WORKFLOW>'
context: fork
agent: Plan
allowed-tools: Read, Grep, Glob
---

Đọc CLAUDE.md, CONTRIBUTING.md, status và ADR-0038. Task cần lập kế hoạch: `$ARGUMENTS`.
Đọc task trong `docs/ping-v0.2.0-plan.md` (file local, không commit). Nếu không có, báo thiếu
nguồn và xin nội dung task; không bịa task từ tên ID.

Ngoại lệ thử nghiệm: `DEMO-WORKFLOW` là task giả, chỉ đề xuất thêm hàm thuần loại trùng danh
sách ID, không sửa file hay gọi dịch vụ. Nó không thuộc backlog sản phẩm.

Đối chiếu phụ thuộc và code thật. Trả bằng tiếng Việt: vấn đề, phạm vi, thiết kế ngắn,
file dự kiến ảnh hưởng, hợp đồng/quyền/migration/Redis nếu có, test cần viết đỏ và tiêu chí
nghiệm thu, kiểm tra phải chạy, rủi ro/rollback, điểm cần OWNER quyết định.
Với task giả: test mảng rỗng, ID trùng, giữ thứ tự, không sửa input.

Chỉ lập kế hoạch. Chờ OWNER duyệt thiết kế cụ thể trước khi code thay đổi lớn. Nếu đã có duyệt
trong phiên, ghi nhận quyết định đó, không hỏi lại. Không tự tạo nhánh, commit, deploy hay merge.
