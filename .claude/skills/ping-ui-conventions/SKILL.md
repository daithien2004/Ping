---
name: ping-ui-conventions
description: Viết hoặc review màn hình, component, theme, i18n và trải nghiệm chat Ping
---

Đọc apps/web/CLAUDE.md, ADR-0023/0029 và ADR UI mới nếu đã accepted. Kiểm đúng Next/React/CSP
đang dùng. Hiện shadcn/globals.css vẫn là nguồn thật; TF mới chuyển antd/Ping sau ADR và spike.

Checklist sau khi bộ Ping được duyệt: feature dùng Ping* với Props riêng; antd chỉ trong
components/ui; wrapper mỏng, ref/test-id, hover/focus/active/disabled/loading, ARIA; token dùng
chung sáng/tối. Form dùng schema shared qua adapter, không viết lại validation. Cache ở hooks,
Query là server state, Zustand là UI state; UI quyền qua CASL và giữ nháp khi chưa ready.
Chuỗi/ARIA vi/en, đủ trạng thái, reduced-motion, responsive, axe, screenshot và bundle theo task.

Đúng: thêm wrapper khi có use case, đo SSR/CSP/bundle trước quyết định. Sai: đổi antd và nới CSP
để qua spike hoặc tạo cả bộ wrapper chưa ai dùng. Chưa có frontend-design cài sẵn thì báo thiếu,
không giả vờ đã áp dụng; tài sản có giấy phép/nhận diện riêng của Ping.
