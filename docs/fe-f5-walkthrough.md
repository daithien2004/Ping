# Triển khai F5: realtime cho frontend

Tài liệu này giải thích luồng triển khai để đọc cùng code. Quyết định kiến trúc nằm ở ADR-0024.

## 1. Tôi bắt đầu từ các tình huống lỗi

Tôi thêm test trước cho trường hợp socket đã xác nhận tin nhưng HTTP báo lỗi muộn, giữ tin
optimistic khi refetch, sửa/xóa tin và refresh token đang chạy lúc logout. Lần chạy đầu thất bại
đúng ở các hành vi chưa có. Sau khi triển khai, các test chuyển sang xanh.

`message-cache.test.ts` dùng cache nhiều trang để kiểm tra nội dung, thứ tự và tính bất biến.
`session.test.ts` dùng socket giả và timer giả để điều khiển ACK, reconnect và cleanup mà không
phải chờ mạng thật. E2E backend và Playwright mới là nơi chứng minh giao tiếp mạng hoạt động.

## 2. Tạo socket nhưng chưa kết nối

Đọc `apps/web/src/features/realtime/socket.ts`:

- `Socket<ServerToClientEvents, ClientToServerEvents>` lấy tên event và payload từ shared.
- `io(env.NEXT_PUBLIC_API_URL, ...)` dùng origin; `/api/v1` chỉ dành cho REST.
- `autoConnect: false` tránh kết nối trong render hoặc lúc server dựng HTML.
- `transports: ['websocket']` khớp gateway hiện có.
- `auth: (cb) => cb({ token: getAccessToken() })` đọc lại token cho mỗi lần handshake.

`RealtimeProvider` được ghép dưới `AuthGate`. Provider đọc `me` từ TanStack Query và tạo phiên
theo `me.id`. Effect đăng ký listener trước khi kết nối; cleanup gỡ listener, dừng timer và ngắt
socket. Đổi tài khoản tạo một phiên/store mới.

## 3. Quản lý phiên socket và room

Đọc `session.ts` từ `start`, `watch`, `join` rồi tới `recover`:

- `start()` đăng ký các sự kiện kết nối và bật timer dọn typing.
- `watch()` ghi nhận channel đang hiển thị; hàm trả về là cleanup gửi leave.
- `join()` chờ ACK có timeout. Chỉ ACK thành công mới gọi callback đồng bộ REST.
- Mỗi lần join/leave tăng generation; ACK cũ không còn tác dụng.
- `stop()` đổi generation và ngắt kết nối, nên refresh đang chờ không thể kết nối lại phiên cũ.
- `recover()` dùng chung `refreshAccessToken()`, retry có khoảng nghỉ khi mất mạng, và kết thúc
  phiên khi refresh bị từ chối. Một token vừa refresh mà vẫn bị từ chối không gây vòng lặp.

`useChannelRealtime` nằm trong `MessagePane`. Khi Next giấu trang bằng Activity, effect cleanup
chạy và leave room. Khi trang hiện lại, hook join và tải lại những thay đổi đã bỏ lỡ. Nháp vẫn ở
`MessageComposer`, nên không cần chuyển nháp sang Zustand.

## 4. Vì sao cần sửa một phần gateway

Trước F5, `handleConnection` xác thực bất đồng bộ. Client có thể thấy `connect` rồi gửi join
trước khi `socket.data.userId` được gán. Tôi chuyển kiểm tra JWT sang namespace middleware;
`next()` chỉ chạy sau khi đã có userId. Timer hết hạn vẫn nằm trong lifecycle connection.

Join phải kiểm tra CASL, đợi `socket.join` xong rồi ACK. Channel không tồn tại và không có quyền
trả cùng mã FORBIDDEN, tránh xác nhận tài nguyên của người khác.

Join/leave dùng hàng đợi Promise theo socket trong WeakMap. Ví dụ người dùng chuyển channel
trong lúc database đang kiểm tra join: leave phải đợi join xong rồi mới rời room. Promise không
được đặt trong `socket.data`, vì Redis adapter cần serialize dữ liệu đó.

Hai test backend mới kiểm tra ACK rồi gửi tin ngay, và join/leave liên tiếp. Các test chạy hai
Nest instance dùng chung Redis để kiểm tra cả đường truyền chéo instance.

## 5. Event cập nhật cache như thế nào

`features/messages/hooks.ts` đăng ký created/updated/deleted. Component không cầm queryClient.
Các phép biến đổi thật nằm trong `message-cache.ts`:

- `upsertMessage`: khớp id hoặc nonce cùng tác giả; response và event chỉ còn một hàng.
- `markFailed`: chỉ đánh dấu hàng chưa được xác nhận; không đổi tin thật thành failed.
- `updateMessage`: áp dụng nội dung mới và ánh xạ updatedAt sang editedAt; bỏ bản sửa cũ hơn.
- `deleteMessage`: xóa hàng và nhớ id đã xóa ngay trong query cache.
- `preserveLocalMessages`: khi REST trả lại lịch sử, giữ tin sending/failed chưa được xác nhận
  và các id đã xóa. Tin thật trong response thắng hàng optimistic cùng nonce.

Nếu event đến khi refetch đang chạy, hook hủy refetch trước khi sửa cache, rồi khởi động lại
đồng bộ. Cách này tránh response cũ ghi đè event, nhưng vẫn lấy đủ tin bị lỡ trong reconnect.
Các con trỏ và cấu trúc trang vẫn thuộc infinite query; socket không có bản sao lịch sử riêng.

## 6. Quyền và membership thay đổi

`features/servers/hooks.ts` nhận hai event cá nhân. PermissionsChanged làm stale cache server
và yêu cầu kiểm tra/join lại room. MemberRemoved dừng room, hủy request và xóa dữ liệu liên quan.

Điểm dễ bỏ sót: key messages là `['channels', channelId, 'messages']`, nên xóa prefix
`['servers', serverId]` chưa đủ. Tôi gom channel ids từ cache danh sách channel và những channel
đã mở trong phiên để xóa cả phần messages. Chỉ chuyển về trang chủ nếu đang xem server đó.

Khi reconnect, REST kiểm tra lại membership vì event gửi lúc offline không được lưu để phát lại.

Test mất quyền còn phát hiện rằng lỗi refetch nền không tự ném lỗi qua Suspense khi cache vẫn
có dữ liệu. Tôi thêm trạng thái lỗi ACK của room để `MessagePane` thay ngay nội dung bằng thông
báo từ chối, rồi hiện lại khi join thành công. Đây là trạng thái giao diện kết nối, không phải
bản sao quyền CASL. Phiên đăng nhập hết hẳn cũng xóa cache riêng tư qua `useSessionExpiry`.

## 7. Typing và i18n

Store chỉ giữ connection status và các lease `{ channelId: { userId: expiresAt } }`.
Selector số người đang gõ giúp component nhỏ cập nhật độc lập với danh sách tin. Client throttle
3 giây; lease hết hạn sau 5 giây; disconnect/leave/logout dọn lease. Socket dùng volatile emit
để không gửi lại typing cũ sau khi mạng phục hồi.

Contract typing chưa có tên người dùng hay typing.stop, nên UI hiển thị thông báo theo số người.
Một lỗi được tìm thấy khi chạy Chromium: tiếng Việt dùng plural category `other` ngay cả khi
count = 1. Tôi dùng nhánh ICU `=1` để hiển thị câu dành cho một người.

## 8. Kiểm tra trình duyệt thật

`e2e/realtime.spec.ts` dùng hai browser context riêng và người dùng thật. Kịch bản kiểm tra nhận
tin không reload, không trùng hàng, typing hết hạn, retry cùng nonce, sửa/xóa qua REST, đổi
channel giữ nháp và đồng bộ lại, offline/online nhận bù tin, mất quyền và bị kick.

Test token hết hạn thay access token của lần refresh đầu bằng JWT có hạn 5 giây, ký bằng secret
local của bộ test; lần refresh sau dùng response thật. Nhờ vậy kiểm tra được gateway ngắt và
frontend refresh/reconnect mà không chờ 15 phút hay thay cấu hình production.

Test F4 về mất HTTP response cũng được sửa: khi socket đã xác nhận, giao diện phải hiện tin
thành công. Trường hợp lỗi thật trước khi server lưu có một kịch bản retry riêng.

Trong Chromium, `setOffline(true)` đôi khi vẫn để WebSocket đã mở tiếp tục hoạt động. Test dùng
`routeWebSocket().connectToServer()` để chuyển tiếp tới server thật, rồi đóng đường truyền đó
khi giả lập offline. Vì vậy ca mất mạng không còn phụ thuộc lúc heartbeat hết hạn. Test còn
kiểm tra bị kick khi offline và phiên bị từ chối refresh phải trở về login, xóa giao diện riêng tư.

## 9. Phạm vi còn lại

UI thành viên/presence được để sang pha riêng theo quyết định của người dùng. F6 mới thêm
CASL UI và các nút sửa/xóa. Không có migration hoặc push trong F5. O1 về shutdown và các vấn đề
vận hành chưa sửa được theo dõi trong docs/known-issues.md, không đưa file đó vào commit.

## 10. Kết quả kiểm tra

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: đạt. Unit test: 25 shared + 7 API +
  57 web = 89 test.
- E2E API (nạp `.env` gốc, cấu hình test dùng Redis DB 1): 66 test đạt trong 11 file.
- `pnpm --filter web test:e2e`: 8 kịch bản Chromium đạt; lần chạy cuối mất khoảng 44 giây.
- Prettier và `git diff --check`: đạt. Pre-commit chạy bình thường, không dùng `--no-verify`.
