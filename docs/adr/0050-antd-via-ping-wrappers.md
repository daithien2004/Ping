# ADR-0050: Áp dụng Ant Design qua bộ wrapper `Ping*`

Status: proposed — chờ OWNER duyệt
Date: 2026-10-22

## Context

Ping v0.2.0 cần hệ thống component nhất quán, hỗ trợ sáng/tối, a11y và hiệu năng. Frontend hiện tại
dùng shadcn/Radix + Tailwind. Quyết định áp dụng Ant Design (antd) bọc sau bộ component `Ping*`
được ghi trong ADR-0038 (mục frontend) và cần ADR riêng để chốt ranh giới, token, SSR/CSP và
ngân sách bundle.

## Decision

1. **Antd chỉ được import trong `apps/web/src/components/ui/` (bộ `Ping*`)**. Mọi màn hình/feature
   import từ `@/components/ui` (`PingButton`, …), không import trực tiếp `antd`.
2. Mỗi `Ping*` là wrapper tùy biến của antd (hoặc tự dựng khi antd không phù hợp) với **API riêng**,
   không rò prop antd ra ngoài (`PingButton` nhận `variant`/`size`/`loading`/`icon`/`block`, không nhận
   `type`/`ghost`/`danger` của antd). Wrapper dùng `forwardRef`, có `data-testid`, đủ trạng thái
   hover/focus-visible/active/disabled/loading, ARIA đúng, chỉ dùng token.
3. Theme lấy từ **nguồn token duy nhất** `apps/web/src/lib/theme/`: màu, typography, spacing 4/8 px,
   radius, elevation, motion, z-index. Ánh xạ sang theme antd (`ConfigProvider` + thuật toán sáng/tối)
   và CSS variables cho component tự dựng.
4. SSR không FOUC: trích style antd vào HTML; chế độ tối đọc từ cookie trước hydrate (không nháy).
5. CSP: style cssinjs của antd dùng nonce hoặc cấu hình tương đương; **không nới `unsafe-inline`**
   nếu chưa ghi lý do và rủi ro trong ADR này.
6. Bundle: import theo thành phần, icon theo tên, lazy-load route quản trị/AI/search. Nếu vượt ngân
   sách bundle ban đầu, viết ADR điều chỉnh ngân sách kèm số đo — không tắt `check:bundle`.

## Alternatives

- Giữ shadcn/Radix + Tailwind hiện tại: ít migration, nhưng thiếu component quản trị/bảng/biểu mẫu
  sẵn có, tốn thời gian dựng lại; khó đồng bộ token với design system mới.
- Dùng antd trực tiếp không wrapper: nhanh ban đầu nhưng rò API antd ra toàn app, khó thay thế và
  khó kiểm soát token/CSP/bundle.

## Consequences

- Lint cấm import `antd` ngoài `components/ui/` (ESLint rule).
- Thay nội bộ một component (ví dụ bỏ antd khỏi `PingTooltip`) không phải sửa nơi dùng.
- Cần spike tương thích (TF.2) trước khi viết UI mới; báo cáo bundle/Lighthouse trong evidence T0.7.
- ADR-0023 (UI hiện tại) vẫn có hiệu lực cho code cũ; migration dần sang bộ `Ping*`.
- Ngân sách bundle ban đầu 450 KB (ADR-0029) được điều chỉnh lên 550 KB sau khi thêm antd (TF.15),
  bằng chứng: JS client ban đầu 525.8 KB gzip sau T0.7. Không tắt check:bundle.
