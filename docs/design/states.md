# Trạng thái và vi tương tác (TF.9)

Tài liệu này là quy ước chung cho mọi màn của Ping: trạng thái tải, trạng thái rỗng, trạng thái
lỗi, cách dùng toast và nguyên tắc chuyển động. Mọi màn mới phải có đủ bốn trạng thái này.

Ảnh chụp từng trạng thái: [`docs/v0.2.0/evidence/TF.9/screens/`](../v0.2.0/evidence/TF.9/screens/).

## 1. Quy ước chung

### 1.1 Loading — skeleton thay spinner

- **Danh sách**: dùng skeleton (`components/skeletons.tsx`), không dùng spinner toàn vùng.
  Sẵn có: `RailSkeleton` (cột server), `SidebarSkeleton` (danh sách channel),
  `MessageListSkeleton` (danh sách tin), skeleton riêng cho panel thành viên.
- **Vùng skeleton phải tự mô tả**: `role="status" aria-busy="true"` kèm `aria-label`
  ("Đang tải tin nhắn…", "Đang tải danh sách channel…", "Đang tải thành viên…") để screen reader
  đọc được trạng thái, không chỉ thấy một khối xám.
- **Nút/hành động**: `PingButton` với `loading` (inline), không chặn toàn màn hình.
- **Giữ ngữ cảnh**: khi skeleton lên, giữ nguyên bố cục để trang không nhảy (không đổi chiều cao
  khung sau khi tải).

### 1.2 Empty state — luôn có hành động gợi ý khi có thể

- **Có hành động**: khi danh sách trống **và** người dùng có quyền thực hiện, hiện nút gợi ý.
  Ví dụ khung chat rỗng → "Gửi tin đầu tiên" (bấm là đưa con trỏ về ô soạn);
  danh sách channel trống → nút "Tạo channel".
- **Chỉ thông báo**: khi không có hành động phù hợp (thiếu quyền), chỉ hiện câu giải thích —
  ví dụ "Server chưa có channel nào." (chỉ khi user **không** tạo được channel).
- **Dùng `PingEmpty`** (bọc antd `Empty`) với `description` đã dịch vi/en; ảnh mặc định
  `PING_EMPTY_IMAGE_SIMPLE`.
- **Câu văn**: nói rõ chuyện gì chưa có + gợi ý bước tiếp theo, không "Không có dữ liệu".

### 1.3 Error state — luôn có mã tham chiếu và cách phục hồi

- **Mã tham chiếu**: lấy bằng `errorReference(error)` → `requestId` của API (khớp log backend) hoặc
  `digest` mà Next gắn vào lỗi ném trên server. Lỗi 5xx đã có mã trong câu thông báo
  (`errors.withReference`) thì không in lần hai ở dòng riêng.
- **Phạm vi hiển thị**:

  | Phạm vi lỗi                               | Cách hiện                                       |
  | ----------------------------------------- | ----------------------------------------------- |
  | Vùng nội dung (form, panel thành viên)    | inline `role="alert"` + nút "Thử lại"           |
  | Cấp route của app (`(app)/error.tsx`)     | error boundary: thông điệp + mã lỗi + "Thử lại" |
  | Trang chưa đăng nhập (`(auth)/error.tsx`) | error boundary riêng (xem 1.4)                  |
  | Sập toàn bộ ứng dụng (`global-error.tsx`) | màn hình tối giản + mã lỗi + nút tải lại        |

- **Không lộ stack trace**, không lộ chi tiết lỗi nội bộ.
- **Lỗi mạng** (`ApiError` status 0) hiện câu thân thiện "Không kết nối được máy chủ." và vẫn có
  nút "Thử lại".

### 1.4 Trang chưa đăng nhập không được sập khi API lỗi

Kiểm tra phiên (`useMe`) là một suspense query: nếu API tạm không tới được, lỗi sẽ ném ra lúc
render và làm **sập trang** nếu không có error boundary. Vì vậy nhóm `(auth)` có boundary riêng
(`apps/web/src/app/(auth)/error.tsx`): người dùng thấy thông điệp thân thiện + mã lỗi + "Thử lại"
thay vì màn hình "Đã xảy ra lỗi nghiêm trọng".

### 1.5 Toast — khi nào toast, khi nào inline

- **Dùng toast** (`pingToast`): hành động ngầm, xong nhanh, không cần bước tiếp theo.
  Ví dụ: sao chép mã mời → "Đã sao chép mã mời."
- **Dùng inline**: lỗi người dùng phải xử lý (sai dữ liệu, thiếu quyền trong ngữ cảnh), trạng thái
  quan trọng, hoặc nội dung cần đọc kỹ để khắc phục.
- **Lỗi cũng được toast** khi đó là hành động ngầm và không chặn công việc (sao chép thất bại).
- **Cài đặt kỹ thuật**: `pingToast` đi qua `App.useApp()` của antd (host `PingToastHost` trong
  `providers/theme-provider.tsx`). `message` tĩnh của antd không thấy `ConfigProvider` nên toast
  lệch theme và antd cảnh báo trong console.
- **Nội dung**: ngắn, một câu, đã dịch vi/en.

### 1.6 Chuyển động (motion)

- **Thời lượng**: ≤ 200 ms cho mọi chuyển động vi tương tác. Token ở `lib/theme/tokens.ts`:
  `motion.fast` 120 ms, `motion.normal` 200 ms, `motion.slow` 200 ms (antd dùng `slow` cho
  modal/drawer nên hạ từ 320 ms xuống 200 ms).
- **Tôn trọng `prefers-reduced-motion`**: khối CSS toàn cục trong `app/globals.css` rút animation và
  transition về gần 0 khi người dùng bật tuỳ chọn này.
- **Token-first**: dùng token `motion.*`/màu/spacing, không hard-code giá trị.

## 2. Trạng thái từng màn

| Màn hình                   | Loading                                           | Empty                                                                            | Error                                                          | Ảnh                       |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| Cột server (rail)          | `RailSkeleton` (3 ô)                              | — (luôn có nút "Tạo server"/"Tham gia server")                                   | `global-error` (lỗi ở cấp danh sách server)                    | `12-chat-light`           |
| Danh sách channel          | `SidebarSkeleton` ("Đang tải danh sách channel…") | Nút "Tạo channel" (có quyền) hoặc "Server chưa có channel nào." (không có quyền) | Inline ở footer sidebar (rời server thất bại)                  | `08-channel-empty`        |
| Khung chat (danh sách tin) | `MessageListSkeleton` ("Đang tải tin nhắn…")      | "Chưa có tin nhắn nào. Hãy gửi tin đầu tiên!" + nút **"Gửi tin đầu tiên"**       | `(app)/error.tsx`: thông điệp + mã lỗi + "Thử lại"             | `03`, `04`, `07`          |
| Panel thành viên           | Skeleton danh sách ("Đang tải thành viên…")       | "Chưa có thành viên nào."                                                        | Inline `role="alert"` + mã lỗi + nút **"Thử lại"**             | `05`, `06`                |
| Ô soạn tin                 | Vô hiệu hoá khi chưa sẵn sàng; trạng thái quyền   | —                                                                                | Inline cho lỗi gửi (đang gửi / thất bại / thử lại)             | `03`                      |
| Hộp thoại (modal)          | Nút có `loading`                                  | —                                                                                | Inline alert trong form                                        | —                         |
| Tìm nhanh (Ctrl/Cmd+K)     | —                                                 | `PingEmpty` "Không tìm thấy"                                                     | —                                                              | `10-quick-switcher-empty` |
| Đăng nhập / đăng ký        | —                                                 | —                                                                                | `(auth)/error.tsx`: thông điệp + mã lỗi + "Thử lại"            | `01`, `02`                |
| Trang 404                  | —                                                 | —                                                                                | `not-found.tsx`: thông điệp + link "Về trang chủ" (`/servers`) | `11-not-found`            |

## 3. Kiểm tra (checklist review)

- [x] Mọi danh sách dùng skeleton khi tải, không dùng spinner lớn; vùng skeleton có `role="status"` + `aria-busy` + nhãn.
- [x] Empty state có hành động gợi ý khi người dùng có quyền; chỉ có chữ khi không có hành động.
- [x] Error state có mã tham chiếu (`requestId`/`digest`) và nút "Thử lại" ở mọi cấp.
- [x] Trang chưa đăng nhập có error boundary riêng — lỗi API không làm sập trang.
- [x] Toast chỉ dùng cho thông báo ngắn, hành động ngầm; lỗi cần xử lý dùng inline.
- [x] Chuyển động ≤ 200 ms và tôn trọng `prefers-reduced-motion`.
- [x] Dùng token motion/màu/spacing, không hard-code giá trị.
- [ ] Mọi màn của Pha 3 (quản trị, UI cho AI) chưa có ảnh trạng thái — sẽ bổ sung khi làm TF.10/TF.11.

## 4. Cách tạo lại ảnh

```bash
# Cần API + web dev server đang chạy
WEB_PORT=3101 node apps/web/scripts/capture-states.mjs
```

Script tự tạo user/server riêng (không đụng dữ liệu dev), ép lỗi/làm chậm request bằng
`page.route` để bắt được từng trạng thái, rồi ghi ảnh vào
`docs/v0.2.0/evidence/TF.9/screens/`.
