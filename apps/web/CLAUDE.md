# Frontend Ping

Đọc [hướng dẫn gốc](../../CLAUDE.md), [CONTRIBUTING](../../CONTRIBUTING.md), `AGENTS.md` tại đây
và guide đúng phiên bản trong `node_modules/next/dist/docs/` trước khi dùng API Next.

- Chiều phụ thuộc `app → features → components → lib`; app chỉ định tuyến. Page lấy params từ
  props; chỉ các component layout được quy định mới dùng `useParams()` (ADR-0020).
- TanStack Query giữ server state, Zustand chỉ giữ UI state. Cache ghi qua hooks feature;
  phép biến đổi cache là hàm thuần có test. Không copy dữ liệu server vào store.
- Effect dùng đồng bộ bên ngoài. `<Activity>` giữ state/DOM của trang ẩn; form nhạy cảm cần
  `useClearOnHide`. Quyền UI chỉ qua CASL; chưa ready thì khóa thao tác, giữ nháp.
- Hiện tại shadcn/Radix và màu trong `globals.css` theo ADR-0023. Chưa tự chuyển sang antd hay
  thay nguồn token: cần ADR UI riêng, spike SSR/CSP/bundle và OWNER duyệt (T0.7/TF).
- Khi bộ `Ping*` được duyệt, feature chỉ dùng API wrapper của Ping; không lộ prop antd. Chat
  cốt lõi có thể tự dựng trên cùng token. Không tự thêm dependency.
- Chữ/ARIA qua i18n vi/en; lỗi qua `useErrorMessage`, trang lỗi gọi `reportError` và có mã tham chiếu.
  Mỗi màn đủ loading/rỗng/lỗi/quyền. Không dùng màu thô hay hiển thị message lỗi nội bộ.
- UI thay đổi phải có Playwright, kiểm trình duyệt thật, axe và check bundle. Responsive mới theo
  ADR phạm vi v0.2.0; không mô tả UI v0.1.0 như đã responsive.

Kiểm: bộ chuẩn ở gốc, `pnpm --filter web test:e2e`, `pnpm --filter web check:bundle` sau build;
CSP/security headers trên production build khi đổi cấu hình. Lưu bằng chứng thật và cập nhật
status sau task; không tự sửa baseline ảnh để che lỗi, giảm ngưỡng, merge hoặc push.
