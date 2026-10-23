# ADR-0058: Đo ngân sách bundle theo JS tải ban đầu (không cộng mọi route)

Status: accepted — OWNER duyệt ngày 2026-10-23
Date: 2026-10-23

## Context

- ADR-0029 đặt ngân sách "total client JS ≤ 450 KB gzip, mỗi chunk ≤ 100 KB"; ADR-0050 nâng lên
  550 KB khi thêm antd, kèm số đo 525.8 KB (T0.7). ADR-0050 mục 6 yêu cầu lazy-load route quản trị/
  AI/search và "nếu vượt ngân sách bundle ban đầu thì viết ADR điều chỉnh kèm số đo, không tắt check".
- Plan v0.2.0 (T3.7, T6.10, checklist phát hành) nói rõ ngân sách là **bundle ban đầu ≤ 450 KB gzip**
  và các route quản trị/AI/search phải tải lười.
- Nhưng `check:bundle` lại cộng **mọi** file trong `.next/static/chunks`, kể cả chunk chỉ tải khi vào
  một route. Vì vậy con số phình theo số route chứ không phản ánh giá trị mà plan giới hạn:
  - `main` tại TF.9 (trước task này): **605.1 KB** theo phép đo cũ → gate đã đỏ sẵn dù JS tải ban đầu
    chỉ 243.0 KB.
  - TF.10 thêm bề mặt quản trị (stack antd Table/Drawer/Select): phép đo cũ +109.7 KB → 714.8 KB và
    một chunk 101.3 KB. Toàn bộ nằm trong route `/servers/[serverId]/settings`, không nằm trên đường
    tải ban đầu.
- Vì thế "vượt ngân sách" ở đây là **lỗi phép đo**, không phải ứng dụng tải 714.8 KB khi mở trang.
  Sửa phép đo đúng theo định nghĩa của plan tốt hơn là nâng trần một con số sai.

## Decision

1. `pnpm --filter web check:bundle` đo **JS tải ban đầu** = `rootMainFiles` + `polyfillFiles` +
   `lowPriorityFiles` trong `.next/build-manifest.json` (những chunk trình duyệt tải trước khi điều
   hướng). Thiếu manifest (chưa `build`) thì **fail kèm thông báo**, không bỏ qua.
2. Mọi chunk JS còn lại là "tải theo yêu cầu" (route quản trị/AI/search, Sentry): **không cộng** vào
   tổng ban đầu nhưng có trần riêng **160 KB/chunk** để một route không thể phình vô hạn. Chunk có
   chuỗi đặc trưng `sentry.javascript` luôn xếp vào nhóm này (ADR-0031).
3. Trần giữ đúng plan: **JS tải ban đầu ≤ 450 KB**, **mỗi chunk ≤ 100 KB**. ADR-0050 nâng lên 550 KB
   không còn hiệu lực; 450 KB là số của checklist phát hành.
4. Vẫn in thêm "tổng mọi chunk (tham khảo)" để thấy xu hướng, nhưng không dùng làm cổng chặn.
5. Không tắt check, không nới CSP/lint. TF.10 đồng thời tách `MemberDetailsDrawer` bằng
   `next/dynamic` (chỉ mount khi mở chi tiết) nên chunk stack bảng giảm 101.3 → 97.8 KB.

## Measurements

Cùng máy, cùng lockfile, `pnpm --filter web build` sạch (`.next` xoá trước khi build), 2026-10-23:

| Trạng thái                  | JS tải ban đầu         | Chunk ban đầu lớn nhất | Tải theo yêu cầu    | Chunk theo yêu cầu lớn nhất | Phép đo cũ (tổng mọi chunk) |
| --------------------------- | ---------------------- | ---------------------- | ------------------- | --------------------------- | --------------------------- |
| `main` (TF.9, trước TF.10)  | **243.0 KB** (8 chunk) | 74.2 KB                | 496.6 KB (38 chunk) | 134.4 KB (Sentry, lazy)     | 605.1 KB → **fail**         |
| TF.10 (sau khi tách drawer) | **243.5 KB** (8 chunk) | 74.4 KB                | 609.1 KB (43 chunk) | 97.8 KB (stack bảng admin)  | 714.8 KB → fail             |

Đọc bảng: TF.10 gần như không đổi JS tải ban đầu (+0.5 KB), chỉ thêm chunk của route cài đặt. Với
phép đo mới: **243.5 ≤ 450 KB** và mọi chunk < 100 KB → đạt, không cần nâng trần.

## Alternatives

- **Nâng `totalKb` lên ~750 KB** (cách hiểu "total client JS" của ADR-0029): đơn giản nhưng hợp thức
  hoá một con số không ai tải, và mỗi route mới lại phải nâng tiếp. Bị loại.
- **Chỉ dựa vào `rootMainFiles`, bỏ trần cho chunk route**: bỏ mất cảnh báo khi một route phình to.
  Bị loại; giữ trần 160 KB/chunk.
- **Giữ nguyên check cũ và chấp nhận gate đỏ**: trái với "không tắt check" và làm mọi task sau đều
  không thể "done". Bị loại.

## Consequences

- Từ nay "bundle" trong evidence/CI là JS tải ban đầu; muốn biết route nào nặng thì xem dòng "tải
  theo yêu cầu" và `pnpm exec next experimental-analyze`.
- Phép đo phụ thuộc `build-manifest.json` của Next (Turbopack). Next đổi định dạng manifest thì
  `check:bundle` fail rõ ràng (có test cho `measure`), phải cập nhật script theo.
- Việc tách route quản trị/AI/search vẫn bắt buộc: feature nào import thẳng vào app shell sẽ đội
  thẳng vào con số 243 KB và có thể vượt 450 KB.
- ADR-0029/0050 giữ nguyên phần quyết định khác; riêng con số ngân sách đọc theo ADR này.
