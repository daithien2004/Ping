# 9 luồng nghiệm thu trên production (2026-11-14)

Bản chạy: `37ae8cb` (khớp [deploy.md](deploy.md)). Máy kiểm: Windows, Chromium qua Playwright,
`ignoreHTTPSErrors` (chứng chỉ tự ký), locale `vi-VN`, viewport **1280×900** và **375×812**.
Tài khoản: `demo1`, `demo2` (thành viên) và owner `owner-demo` — mật khẩu nằm trong `.env.demo`,
không in ra. Hai phiên trình duyệt riêng cho `demo1`/`demo2`; phiên owner chỉ dùng để kick, ghim
và tạo phiên thứ hai. Dữ liệu server: [demo-data.md](../../../runbook/demo-data.md).

Thời điểm chạy cuối: 1280 lúc 05:30 UTC, 375 lúc 05:35 UTC; luồng 8 chạy lại theo kịch bản
chặt (offline 45 giây + 5 tin từ `demo2`) lúc 05:56 UTC. Ảnh ở [`screens/`](screens/).

## Kết quả

| #   | Luồng                                      | 1280    | 375     | Ghi chú                                                                 |
| --- | ------------------------------------------ | ------- | ------- | ----------------------------------------------------------------------- |
| 1   | Đăng nhập                                  | **Đạt** | **Đạt** | Vào `/channels/<server>/<general>`, ô soạn tin sẵn sàng.                |
| 2   | Bị kick rồi tham gia lại bằng mã mời       | **Đạt** | **Đạt** | Server biến mất, trang chủ hiện "Nhập mã mời", vào lại thấy 3 kênh.     |
| 3   | Gửi / trả lời / cảm xúc / ghim / sửa / xóa | **Đạt** | **Đạt** | Ghim bằng phiên owner; demo1 thấy chỉ báo ghim qua realtime.            |
| 4   | Tệp đính kèm                               | **Đạt** | **Đạt** | Xem trước mở/đóng được; tải xuống đúng tên gốc, đuôi `.webp`.           |
| 5   | Chưa đọc / nhắc tên / hai tab              | **Đạt** | **Đạt** | `(1) Ping` ở cả hai tab, badge nhắc tên, vạch "Tin mới", đọc xong về 0. |
| 6   | Tìm kiếm và nhảy tới tin                   | **Đạt** | **Đạt** | Lọc `# general`; bấm kết quả tới permalink, tin đích được tô sáng.      |
| 7   | Hỏi AI                                     | **Lỗi** | **Lỗi** | Production thiếu `GROQ_API_KEY` — xem mục lỗi bên dưới.                 |
| 8   | Mất mạng 45 giây, 5 tin từ demo2           | **Đạt** | **Đạt** | Đủ 6/6 tin, không trùng, đúng thứ tự; không cần tải lại trang.          |
| 9   | DM và cài đặt cá nhân                      | **Đạt** | **Đạt** | Chặn/bỏ chặn, đổi tên, sáng/tối, en/vi, thu hồi phiên khác.             |

## Chi tiết từng luồng

1. **Đăng nhập** — chỉ `demo1` ở cả hai viewport. Vào kênh đích, thấy banner "Email chưa xác minh";
   luồng xác minh email **không áp dụng** trên môi trường này — production không có mailer, nên
   **F7 giữ `một phần`** (đã chạy qua Mailpit local ở TG.8, chưa gửi thư qua nhà cung cấp thật).
   Ảnh: [1280](screens/flows-1280-01-login.png), [375](screens/flows-375-01-login.png).
2. **Tham gia bằng mã mời** — owner kick `demo1` qua API (dùng member id). `demo1` tải lại: không
   còn server trong rail, trang chủ hiện nút "Nhập mã mời". Nhập mã mời của server, vào lại thấy
   `# general`, `# random`, `# dev` và gửi tin được.
   Ảnh: [1280](screens/flows-1280-02-join.png), [375](screens/flows-375-02-join.png).
3. **Gửi / trả lời / cảm xúc / ghim / sửa / xóa** — gửi tin, bấm "Trả lời" trên chính tin vừa gửi
   (thanh "Đang trả lời" + khối trích dẫn trong tin trả lời), thả `👍` (pill có `data-me="true"`),
   ghim tin của `demo2` bằng phiên owner (demo1 không có `manageMessages`, menu chỉ có "Sao chép
   liên kết"), `demo1` thấy chỉ báo ghim ngay không cần tải lại; sửa hiện "(đã sửa)"; xóa kèm hộp
   xác nhận và tin biến mất.
   Ảnh: [1280](screens/flows-1280-03-chat.png), [375](screens/flows-375-03-chat.png).
4. **Tệp đính kèm** — chọn PNG, chờ "Sẵn sàng gửi", gửi, mở/đóng "Xem trước", tải xuống. Server
   trả `luong-4-<width>.webp` (chuyển đổi phía máy chủ); tên gốc trùng, chỉ khác đuôi.
   Ảnh: [1280](screens/flows-1280-04-ready.png), [1280 gửi](screens/flows-1280-04-sent.png),
   [375](screens/flows-375-04-ready.png), [375 gửi](screens/flows-375-04-sent.png).
5. **Chưa đọc / nhắc tên / hai tab** — đọc hết `# random`, `# dev`, `# general` để tiêu đề về
   `Ping`; `demo2` nhắc `@demo1` ở `# dev`; cả hai tab đều lên `(1) Ping`, badge nhắc tên hiện;
   mở `# dev` thấy vạch "Tin mới", badge biến mất, hai tiêu đề về 0.
   Ảnh: [1280 badge](screens/flows-1280-05-unread.png),
   [1280 vạch](screens/flows-1280-05-divider.png), [375 badge](screens/flows-375-05-unread.png),
   [375 vạch](screens/flows-375-05-divider.png).
6. **Tìm kiếm và nhảy tới tin** — mở "Tìm trong server", gõ `trích dẫn`, lọc `# general`; bấm kết
   quả → URL `/channels/<server>/<general>/<messageId>`, khung chat nạp cửa sổ quanh tin, tin đích
   tô sáng và nằm giữa khung, có nút "Tải tin mới hơn" (không bị kéo xuống đáy).
   Ảnh: [1280 kết quả](screens/flows-1280-06-results.png),
   [1280 nhảy](screens/flows-1280-06-jump.png), [375 kết quả](screens/flows-375-06-results.png),
   [375 nhảy](screens/flows-375-06-jump.png). **Lưu ý:** chỉ đúng khi tin đích nằm ngoài trang đầu —
   xem lỗi P1 bên dưới.
7. **Hỏi AI** — mở panel, gửi "Kênh general đang bàn về gì?"; SSE trả `event: error` với
   `AI_UNAVAILABLE`, UI báo "AI hiện không sẵn sàng. Vui lòng thử lại sau." nên không có câu trả lời
   lẫn chip trích dẫn để kiểm. **Không đạt vì cấu hình**, không phải lỗi UI.
   Ảnh: [1280](screens/flows-1280-07-unavailable.png), [375](screens/flows-375-07-unavailable.png).
8. **Mất mạng rồi gửi tiếp** — tab `demo1` đặt offline **45 giây**, gõ "Tin offline …" rồi Enter
   (ô nhận chữ, chưa gửi được) và banner "Mất kết nối" hiện. Trong lúc mất mạng, `demo2` gửi **5
   tin** cách nhau 3 giây qua API công khai. Bật mạng lại, chờ banner biến mất rồi thêm 15 giây,
   cuộn xuống đáy: cả **6 tin** hiện đúng **một lần**, không cần tải lại trang. Kiểm ngược bằng
   `GET /messages?limit=100`: server có đúng 6 tin, thứ tự cũ→mới là 5 tin của `demo2` rồi tin
   offline (flush lúc reconnect).
   Ảnh: [1280 mất mạng](screens/flows-1280-08-offline.png),
   [1280 sau](screens/flows-1280-08-after.png), [375 mất mạng](screens/flows-375-08-offline.png),
   [375 sau](screens/flows-375-08-after.png).
   **Quan sát thêm (P2):** ngay sau reconnect, nếu người dùng chưa cuộn xuống đáy thì tin mới có
   thể nằm ngoài cửa sổ ảo hóa (không render dù đã có trong cache) — dữ liệu vẫn đủ, đúng thứ tự.
   Đã ghi ở `docs/known-issues.md` (ghi chú cục bộ, không commit).
9. **DM và cài đặt cá nhân** — mở danh sách thành viên, bấm `Demo 2` → hồ sơ → "Nhắn tin", gửi DM;
   chặn (banner chặn hiện) rồi bỏ chặn; đổi tên hiển thị sang "Demo 1 Pilot" rồi trả lại "Demo 1";
   giao diện tối rồi về hệ thống; ngôn ngữ en rồi về vi; trang `/settings` có phiên hiện tại + phiên
   thứ hai, "Thu hồi phiên khác" còn 1 dòng, `POST /auth/refresh` của phiên bị thu hồi trả **403**
   (bị từ chối; 401 cũng chấp nhận, điều cần kiểm là không refresh được nữa).
   Ảnh: [1280 DM](screens/flows-1280-09-dm.png), [1280 chặn](screens/flows-1280-09-block.png),
   [1280 tối](screens/flows-1280-09-dark.png), [1280 en](screens/flows-1280-09-en.png),
   [1280 phiên](screens/flows-1280-09-sessions.png),
   [1280 sau thu hồi](screens/flows-1280-09-sessions-after.png) và bộ 375 tương ứng.

## Lỗi ghi nhận

### P1 — Permalink tới tin nằm trong trang đầu mở ở đáy kênh

- **Khi nào:** mở permalink `/channels/<server>/<channel>/<messageId>` của một tin **đã nằm trong
  trang tin đầu tiên** (kênh ≤ 50 tin, hoặc tin thuộc 50 tin mới nhất). Gặp ở mọi nguồn permalink:
  kết quả tìm kiếm, liên kết đã sao chép, chip trích dẫn.
- **Hiện tượng:** URL đúng, nhưng khung chat dừng ở tin mới nhất; tin đích không được render
  (danh sách ảo hóa) nên không tô sáng, không cuộn tới. Không phát sinh request `?around=`.
- **Tái hiện (2026-11-14):** `# general` có 50 tin ở trang đầu (`hasMore=true`); chọn tin thứ 26
  `01a1d880-e42c-713f-bf6d-cf73e77969bf`, mở
  `/channels/01a1d82d-3653-7766-9cf0-ea31e55c0092/01a1d82d-3657-74d6-bd83-0f307830011a/01a1d880-e42c-713f-bf6d-cf73e77969bf`.
  Đo ở cả hai viewport: **0 request `?around=`**, **0** thẻ `article[data-message-id]` của tin đích.
  Ảnh: [1280](screens/flows-1280-06-recent-target.png), [375](screens/flows-375-06-recent-target.png).
- **Nguyên nhân:** `use-permalink-window.ts:22-27` bỏ qua `?around=` khi tin đã có trong danh sách
  (đúng thiết kế), nhưng `use-message-scroll.ts:60-76` vẫn hẹn cuộn xuống tin cuối bằng
  `requestAnimationFrame`; hiệu ứng cuộn tới tin đích (`:78-82`) chạy trước nên bị cuộn-đáy đè lên.
- **Kỳ vọng:** tin đích được cuộn vào giữa và tô sáng như trường hợp tin cũ (đã đạt ở luồng 6).
- **requestId:** không áp dụng — không có phản hồi lỗi. Console: không có lỗi.

### P1 — Hỏi AI không khả dụng trên production

- **Hiện tượng:** gửi câu hỏi ở panel "Hỏi AI" nhận `event: error` với
  `{"code":"AI_UNAVAILABLE","message":"Thiếu GROQ_API_KEY"}`; UI báo "AI hiện không sẵn sàng. Vui
  lòng thử lại sau.".
- **Ảnh hưởng:** luồng 7 không thể nghiệm thu phần trả lời + trích dẫn. Cần đặt `GROQ_API_KEY`
  trong `.env.prod` của API rồi khởi động lại service.
- **requestId:** không có trong payload SSE; mã lỗi `AI_UNAVAILABLE`.

### Ngoài 9 luồng — Tab GIF chưa khả dụng

`GET /api/v1/gifs/trending` trả **503** (production chưa có khóa Tenor). UI báo "Tính năng GIF tạm
thời chưa khả dụng. Thử lại sau nhé.". Đã ghi ở [demo-data.md](../../../runbook/demo-data.md).

## Lỗi console/HTTP đã gặp và đã giải thích

- `401 POST /auth/refresh` khi chưa có phiên — phản hồi mong đợi của lần mở đầu.
- `403 GET /servers/<id>` ngay sau khi bị kick — server đã gỡ thành viên, UI quay về trang chủ.
- `net::ERR_INTERNET_DISCONNECTED` (HTTP và WebSocket) trong luồng 8 — do chủ động `setOffline`.

## Cách chạy lại

Script Playwright dùng một lần (đăng nhập hai phiên, gọi API để kick/ghim/nhắc tên/tạo phiên phụ)
đã xóa sau khi chạy để không giữ mật khẩu trong repo. Muốn lặp lại: dựng lại script tương tự từ
`.env.demo` (gitignored), chạy `node <script> 1280` rồi `node <script> 375`, ảnh ghi vào
`screens/flows-<width>-*.png`.
