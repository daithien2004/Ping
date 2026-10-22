---
name: case-study-writer
description: Viết hoặc review hồ sơ phỏng vấn, demo và case study Ping dựa trên evidence
---

Đọc mục 8 kế hoạch local và ADR-0038; chọn đúng mức đầy đủ/ngắn của case trong lịch 8 tuần.
Đọc evidence gốc, không suy số liệu từ tên task done hoặc copy giá trị dự kiến làm kết quả.

Checklist: bối cảnh → vấn đề quan sát → ràng buộc → phương án/trade-off → cách triển khai
→ kiểm chứng/số đo → giới hạn → điều sẽ làm khác đi. Mỗi số có commit/môi trường/ngày/cách chạy.
Giải thích bằng tiếng Việt, đủ để OWNER trình bày lại trong phỏng vấn, có sơ đồ nếu giúp hiểu.

Đúng: “giảm event ở cùng kịch bản, số đo liên kết báo cáo”. Sai: “tăng tốc 10x” không có baseline.
Chưa đo thì ghi rõ, giữ phân biệt prototype, local production stack, staging và production.
