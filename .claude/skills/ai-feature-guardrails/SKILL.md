---
name: ai-feature-guardrails
description: Đụng LLM, embedding, RAG, vector search, SSE hoặc chi phí AI trong Ping
---

Đọc ADR phạm vi, threat model và các ADR AI đã tồn tại. Provider sau port, API theo phiên bản
đã cài; xác minh giá và điều khoản từ nguồn chính thức ở thời điểm chọn. Không tự đăng ký trả phí.

Checklist: membership từ Postgres → filter serverId → hydrate lại tin còn tồn tại/đúng quyền
→ mới đưa vào prompt. Không index DM. Dữ liệu chat không tin cậy; phân cách dữ liệu/instruction,
không cấp tool cho LLM, kiểm trích dẫn và từ chối khi thiếu ngữ cảnh. Có quota user/ngày,
budget kill-switch, timeout/retry hữu hạn, hủy SSE và degrade để chat/search còn dùng được.
Test prompt injection, cross-server, kick/xóa tin, quota/ngân sách và provider chết; golden Q&A
theo phạm vi đã duyệt. Metrics không chứa prompt/nội dung/user ID có cardinality cao.

Đúng: vector trả ID, hydrate qua DB theo quyền trước khi dùng. Sai: tin rằng filter vector đủ
hoặc log prompt để debug. Không tuyên bố bộ test chứng minh không thể bị prompt injection.
