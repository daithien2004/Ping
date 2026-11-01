# ADR-0073: App shell responsive 375/768/1280, drawer điều hướng chung dưới md

Status: accepted — OWNER duyệt trong phiên 2026-10-31 khi chốt lô 2 v0.2.0 ("bắt đầu đi") và
chọn phương án "drawer chung". Thay thế phần "desktop only" của ADR-0023 cho v0.2.0; không đổi
token màu hay bộ component `Ping*`.
Date: 2026-10-31

## Context

T6.8 (docs/ping-v0.2.0-plan.md:556) yêu cầu app dùng được ở tablet và ≥ 375 px: sidebar thành
drawer, ô soạn tin cố định, danh sách ảo hoá vẫn chạy, không vỡ bố cục ở 375/768/1280, chat và
unread dùng được; có e2e theo viewport. ADR-0038 đã đưa responsive 375/768/1280 vào phạm vi bắt
buộc của v0.2.0, trong khi ADR-0023 vẫn ghi giao diện là desktop-only.

Hiện trạng trước T6.8:

- `(app)/layout.tsx` đặt `min-w-[960px]` trên hàng nội dung: cửa sổ hẹp hơn 960 px bị cuộn
  ngang, thanh rail + sidebar (72 + 240 px) chiếm gần hết 375 px.
- Rail (`w-18`), sidebar server/DM (`w-60`) và panel thành viên (`w-60`)/ghim (`w-72`) là cột
  tĩnh trong flex row; ở 375 px phần chat còn ~60 px nếu mở cả hai panel.
- Nav cài đặt là cột dọc `w-56`; bảng quản trị dùng antd `Table` không có `scroll.x` nên cột bị
  bóp hoặc tràn.
- Không có trạng thái "drawer đóng/mở", không khoá focus, không đóng khi đổi route.

## Decision

1. **Mốc breakpoint**: `md` (768 px) là ranh giới rail + sidebar tĩnh; `lg` (1024 px) là ranh
   giới panel thành viên/ghim tĩnh. Dưới `lg` hai panel này thành overlay neo phải, bắt đầu dưới
   header kênh (`top-12`) để nút bật/tắt trên header vẫn bấm được.
2. **Một drawer chung dưới `md`**: thanh trên cao 48 px (`md:hidden`) chứa nút mở điều hướng;
   rail (72 px) và sidebar (240 px, `left-18`) là hai nhánh DOM khác nhau nhưng cùng một trạng
   thái `useMobileNav` (features/shell/store.ts) nên trượt vào/ra như một khối 312 px. Không làm
   hai drawer riêng hay bottom navigation: giữ nguyên thứ tự thông tin của desktop và không phải
   nhân đôi điều hướng.
3. **Drawer nằm `absolute` trong hàng nội dung**, không `fixed` theo viewport: hàng này đã ở dưới
   banner kết nối/xác minh email và thanh trên, nên chiều cao drawer luôn khớp phần còn lại kể cả
   khi banner xuất hiện. Lớp phủ dùng token `bg-scrim` (mới trong globals.css) thay vì màu thô.
4. **Đóng drawer**: nút bật/tắt, backdrop, phím Esc (trả focus về nút), đổi route (theo dõi
   pathname) và khi cửa sổ mở rộng qua `md` (`matchMedia`). Khi mở, focus vào panel; Tab được
   giữ trong các phần tử focusable của cả rail lẫn sidebar (`[data-mobile-nav]`) vì hai nhánh
   không nằm trong một cây focus-trap.
5. **Sidebar dùng `visibility` + `translate-x`** thay vì unmount: giữ dữ liệu/cuộn của danh sách
   kênh, nhưng `visibility: hidden` bảo đảm link không lọt vào tab order khi drawer đóng. Rail và
   sidebar đều thêm `min-h-0` + `overflow-y-auto` để danh sách dài tự cuộn trong chiều cao drawer.
6. **Panel thành viên mặc định đóng ở màn hẹp**: store vẫn mặc định mở cho desktop, nhưng
   `ChannelView` đóng panel khi vào `< lg` hoặc khi cửa sổ thu nhỏ qua mốc, tránh overlay che gần
   hết vùng chat ở lần mở đầu. Người dùng vẫn mở lại bằng nút trên header.
7. **Nav cài đặt thành dải tab ngang** dưới `md` (`overflow-x-auto`, `whitespace-nowrap`) và
   giữ cột dọc từ `md`; nội dung mục vẫn là vùng cuộn riêng nên không lồng hai scroller dọc.
8. **Bảng quản trị cuộn ngang**: `PingTable` đặt `scroll={{ x: 'max-content' }}` — cột giữ độ
   rộng đọc được, màn hẹp cuộn trong bảng thay vì đẩy cả trang tràn.
9. **Không còn `min-w-[960px]`**: mọi màn hình phải có `scrollWidth ≤ clientWidth` ở 375 px.
   `data-testid="message-scroll"` đánh dấu vùng ảo hoá để e2e đo/ cuộn ổn định.
10. **Bằng chứng**: e2e `responsive.spec.ts` mở một phiên, đổi viewport 1280 → 768 → 375 trên
    cùng trang, kiểm không tràn ngang, rail/sidebar tĩnh ở ≥ md, drawer + Esc + trả focus + đóng
    khi đổi route ở 375, gửi tin ở cả ba mốc và danh sách ảo vẫn tải tin cũ.

## Alternatives

- Giữ `min-w-[960px]` và cho cuộn ngang cả trang: đúng nghĩa "không vỡ" nhưng không dùng được ở
  375 px, trái ADR-0038 — loại.
- Hai drawer riêng (rail mở từ trái, sidebar mở từ phải): thêm trạng thái và hai focus-trap, dễ
  mở chồng nhau; một khối 312 px giống desktop dễ hiểu hơn — loại.
- Bottom navigation cho mục chính: phải thiết kế lại thứ tự điều hướng, ẩn bớt kênh, và không
  tái dùng rail; ngoài phạm vi T6.8 — loại.
- Ẩn panel thành viên/ghim hoàn toàn dưới `lg`: mất tính năng ở tablet; overlay giữ được tính
  năng mà không chiếm bề ngang — chọn overlay.
- Dùng `fixed` cho drawer: lệch khi banner kết nối/xác minh email hiện ra (drawer bắt đầu ở
  `top-12` của viewport trong khi header đã bị đẩy xuống) — loại.

## Consequences

- App dùng được ở 375 px: chat chiếm toàn bộ bề ngang, điều hướng mở bằng một nút; 768 px vẫn
  giữ rail + sidebar như desktop, panel phụ thành overlay; 1280 px không đổi.
- Drawer là thành phần client duy nhất mới; layout server chỉ chuyển sang `AppShell`. Không thêm
  dependency, không đổi API.
- `visibility: hidden` + transition nghĩa là drawer biến mất ngay khi đóng (không thấy hiệu ứng
  trượt ra); chấp nhận để đơn giản và tránh phần tử ẩn còn bấm được.
- e2e responsive chạy một phiên đăng nhập và đổi viewport tại chỗ, không tăng ngân sách
  `/auth/login` 10 lần/phút/IP; test dùng `:visible` vì `<Activity>` giữ trang kênh cũ trong DOM.
- Panel thành viên tự đóng khi thu nhỏ cửa sổ: trạng thái mở của desktop không được giữ qua mốc
  `lg`; người dùng mở lại bằng nút trên header.
- Chưa phải giao diện mobile-native: tooltip rail vẫn theo hover, bàn phím ảo chưa được xử lý
  riêng; T6.9 kiểm axe/bàn phím trên các màn mới ở cả ba mốc.
