---
description: Viết bản nháp case study Ping từ bằng chứng thực tế
argument-hint: '<1-9>'
context: fork
agent: doc-sync
allowed-tools: Read, Grep, Glob, Edit, Write
---

Đọc mục 8 của kế hoạch local, ADR-0038, evidence/status và báo cáo liên quan cho case `$ARGUMENTS`.
Chỉ viết vào docs/v0.2.0/case-studies, không sửa code hay tự tạo số đo.
Case 1/2/4/5/6/8 bản đầy đủ, 3/7/9 bản ngắn nửa trang theo lịch 8 tuần.

Ghi: vấn đề, ràng buộc, phương án, quyết định/trade-off, sơ đồ nếu hữu ích, số đo trước/sau
với commit/môi trường/cách chạy, giới hạn, điều sẽ làm khác đi. Dẫn tới evidence đã tồn tại;
chỗ thiếu thì ghi “chưa đo”, không dùng số laptop thành sức tải staging hoặc kết quả dự kiến thành kết quả thật.
