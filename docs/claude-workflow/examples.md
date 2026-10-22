# Prompt và smoke test workflow

## Task thật

Đúng: “Lập kế hoạch T1.1 theo ADR-0038. Đọc cấu hình pool thật, nêu test cạn pool và cách đo;
chờ duyệt thiết kế trước khi sửa code.”

Sai: “Tối ưu toàn bộ backend, tăng giới hạn để test xanh, rồi deploy.”

Sau khi thiết kế được duyệt: `/ship-task T1.1`. Cung cấp bằng chứng duyệt trong phiên nếu tiếp
từ cuộc trò chuyện khác; không coi status doing là quyền thao tác phá hủy hoặc mua dịch vụ.

## Smoke task giả

1. Máy đã cài và đăng nhập Claude Code; ghi `claude --version`, ngày và commit repo.
2. Ghi `git status --short` ban đầu, giữ các thay đổi có sẵn.
3. Trong Claude Code tại gốc repo, kiểm `/hooks`, `/permissions`, `/agents` rồi gọi
   `/plan-feature DEMO-WORKFLOW`.
4. Kết quả phải có kế hoạch cho hàm thuần loại trùng ID và test: rỗng, trùng, giữ thứ tự,
   không mutate input. Chưa được sửa file, tạo branch, commit hay gọi dịch vụ.
5. Ghi status Git sau; xác nhận không có thay đổi ngoài metric hook nếu nó thực sự phát sinh.
   Lưu output đã bỏ thông tin tài khoản vào evidence T0.3. Chưa có log này không đánh dấu done.

Đây là checklist chạy thật, không phải bằng chứng smoke đã đạt. Test Node cho scripts chỉ kiểm
chính sách/hook process, không xác nhận Claude runtime đã nhận command hoặc frontmatter.
