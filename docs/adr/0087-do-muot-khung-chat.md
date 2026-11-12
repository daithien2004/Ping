# ADR-0087: Độ mượt khung chat — tin đang gửi, URL biểu cảm ổn định, tải trước biểu cảm, ảnh lạc quan

Status: accepted
Date: 2026-11-12

## Context

Sau ADR-0086, trải nghiệm gửi/đọc tin còn bốn điểm nhấp nháy hoặc chờ mạng mà người dùng thấy
rõ khi so với Discord:

1. Tin đang gửi bị giảm độ mờ (`opacity-60`) rồi bừng sáng khi server xác nhận — chữ nháy hai
   lần trên một tin vừa gõ.
2. URL hồ sơ (`profileLink`, sticker, emoji) được ký lại ở **mỗi lần đọc**: `expires` bằng
   `now + 30 ngày`, nên phản hồi POST, event socket và mỗi lần refetch trả URL khác nhau. `<img>`
   đổi `src` dù cùng tệp vẫn tải lại, nháy ảnh, và mọi hàng trong danh sách bị dựng lại.
3. Mở picker lần đầu phải chờ cả chunk JS (đã hâm nóng) **và** gọi API danh sách emoji/sticker;
   sau F5 danh sách biểu cảm mất sạch vì không nằm trong cache khung.
4. Tin có ảnh đính kèm chỉ hiện ảnh sau khi POST trả về: người gửi thấy một hàng trống rồi ảnh
   mới bật ra, dù tệp đã upload xong và server đã có thumbnail trước khi bấm gửi.

Ràng buộc: URL hồ sơ phải còn qua kiểm tra `expires <= now + PROFILE_URL_SECONDS` ở
`attachments.service.ts`; không lưu ảnh blob trong cache (không có chỗ thu hồi object URL khi
tin bị xóa/refetch); tin lạc quan phải giữ hành vi gửi lại cùng nonce; cache vẫn chỉ lưu các
nhánh "khung" nhẹ.

## Decision

**Bốn thay đổi nhỏ, cùng mục tiêu: không đổi thứ đang hiện nếu dữ liệu không đổi.**

- **Tin đang gửi không giảm độ mờ.** `aria-busy` vẫn là dấu hiệu trạng thái cho test e2e và
  skin Pop; chỉ bỏ lớp `opacity-60` để chữ không nháy khi xác nhận.
- **Mốc `expires` của URL hồ sơ làm tròn xuống theo ô một giờ.** `profileExpires()` trả
  `floor(now / 3600) * 3600 + PROFILE_URL_SECONDS`; mọi lần đọc trong cùng ô trả URL y hệt
  nhau. Làm tròn xuống nên hạn vẫn ≤ `now + 30 ngày` (qua được kiểm tra ở `file()`), và 30 ngày
  chia hết cho 1 giờ nên `expires` cũng tròn giờ. Áp dụng cho avatar/icon, sticker và custom
  emoji — mọi nơi dùng `profileSign`.
- **Cache tin giữ URL sticker đang hiện.** Khi bản mới cùng `sticker.id`, chưa bị xóa, và URL cũ
  còn hạn trên 1 ngày, `upsertMessage` (echo socket, phản hồi POST, gửi lại) và
  `preserveLocalMessages` (refetch/structural sharing) dùng lại `url`/`previewUrl` cũ. Không có
  gì đổi thì trả nguyên object cũ để TanStack Query không re-render hàng đó.
- **Tải trước danh sách biểu cảm lúc ô soạn tin rảnh.** `prefetchEmojis`/`prefetchStickers` gọi
  `prefetchQuery` với cùng `staleTime` 5 phút; composer gọi trong `requestIdleCallback` (fallback
  `setTimeout`) như chunk picker. `query-persist` thêm `servers/:id/emojis` và
  `servers/:id/stickers` vào danh sách được lưu — cùng cơ chế, cùng hạn 6 giờ.
- **Tin lạc quan mang DTO tệp đã upload.** `DraftFile` lưu `attachment` server trả lúc `ready`;
  `textMessage` nhận `AttachmentDto[]` (thay vì mảng id), và tin tạm có `attachments` thật thay
  cho `pendingAttachmentIds`. `AttachmentList` vì thế chạy luôn nhánh ảnh: xin link ký khi vào
  vùng nhìn, chừa ô theo `width/height`. Thường ảnh đã tải xong trước khi POST xác nhận, và khi
  tin thật thay tin tạm thì cùng id nên query link được dùng lại, `src` không đổi. Gửi lại giữ
  `preview.attachments` để hàng lỗi không mất ảnh.

## Alternatives

- **Giữ object URL của `File` để xem trước:** ảnh hiện ngay nhưng phải thu hồi khi tin xác nhận,
  bị xóa hoặc cache bị thay; lưu blob trong cache làm tăng RAM và dễ rò. Upload đã `ready` nghĩa
  là thumbnail server có sẵn — dùng chính nó rẻ hơn và không cần vòng đời blob.
- **Chỉ merge URL ở client, không đổi mốc ký:** echo và refetch của **danh sách** emoji/sticker/
  avatar vẫn sinh `src` mới cho mọi ảnh trên màn hình; bucket ở server sửa một lần cho mọi
  consumer.
- **Làm tròn `expires` lên ô kế tiếp:** hạn có thể vượt `now + 30 ngày` và bị `file()` từ chối.
- **Lưu cả cache tin nhắn vào localStorage:** infinite pages phình dung lượng và lệch cửa sổ
  permalink — giữ nguyên quyết định của ADR-0077/persist khung.
- **Cho ảnh đính kèm dùng luôn URL ký "hồ sơ" để ổn định:** URL tin nhắn ràng buộc người xem và
  kiểm lại quyền mỗi lần tải (ADR-0079); đổi sang URL hồ sơ sẽ nới quyền đọc tệp.

## Consequences

- Trong một ô giờ, URL biểu cảm/avatar lặp y hệt giữa POST, socket và refetch: `<img>` không tải
  lại, danh sách không re-render vì URL. Khi sang ô giờ mới, lần fetch kế tiếp có URL mới nhưng
  client vẫn giữ URL đang hiển thị cho sticker đến khi nó còn dưới 1 ngày hạn.
- `expires` vẫn nằm trong 30 ngày kể từ lần đọc; URL cũ không sống lâu hơn trước.
- Tin tạm có thể gọi `GET /attachments/:id/download` trước khi tin tồn tại; service cho phép vì
  người gọi là uploader của tệp chưa gắn tin (`downloadable`).
- `pendingAttachmentIds` bị bỏ; nguồn duy nhất cho danh sách tệp cần gửi/khi gửi lại là
  `message.attachments`. Upload `ready` luôn kèm `attachment` trong DTO trạng thái.
- Danh sách emoji/sticker sau F5 hiện bản lưu tối đa 6 giờ rồi refetch nền — giống channel/quyền
  hiện tại; emoji vừa bị xóa có thể còn trong picker đến khi refetch xong.
- Không đổi hợp đồng API; `MessageDto` vốn đã có `attachments` nên client cũ không bị ảnh hưởng.
