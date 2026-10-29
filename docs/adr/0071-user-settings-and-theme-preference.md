# ADR-0071: Cài đặt người dùng lưu server, chủ đề theo lựa chọn (data-theme)

Status: accepted — OWNER duyệt trong phiên 2026-10-29 (ủy quyền "làm nốt tới khi merge push main").
Đổi một phần ADR-0023: chế độ tối không còn chỉ theo hệ điều hành mà theo lựa chọn người dùng
(sáng/tối/hệ thống), lưu phía server để đồng bộ nhiều thiết bị.
Date: 2026-10-29

## Context

TG.13 (docs/ping-v0.2.0-plan.md:510) cần trang cài đặt: Tài khoản, Giao diện (sáng/tối/hệ
thống, mật độ tin nhắn, cỡ chữ), Ngôn ngữ, Thông báo, Riêng tư (DM từ thành viên server, danh
sách chặn), Phím tắt; **lưu phía server, áp dụng ngay, đồng bộ nhiều thiết bị**; giá trị không
hợp lệ bị từ chối; e2e đổi cài đặt giữa hai tab.

Hiện trạng trước TG.13:

- ADR-0023 chốt chế độ tối **chỉ** theo `prefers-color-scheme`, không `.dark`, không
  `next-themes` — nhưng ghi rõ "deferred until a manual theme toggle is wanted". TG.13 chính là
  nhu cầu đó.
- Chưa có bảng cài đặt nào; `User.dmAllow` (TG.9) chỉ có PATCH, chưa có GET nên UI không đọc
  được giá trị đã lưu. `UserBlock` (TG.9) chưa có danh sách; UI TG.9 tự nhớ ở store.
- Chữ trong app đi qua `useTranslations`; ngôn ngữ lấy từ **cookie** tại server render
  (i18n.config), `LanguageSwitcher` chỉ ghi cookie + reload.
- TG.12 đã tách: mức thông báo + mute lưu server; âm thanh/quyền Notification là thiết bị-riêng.

## Decision

1. **Bảng `UserSettings` một hàng mỗi user** (`userId` PK, FK cascade): cột tường minh
   `theme | density | fontSize | locale` kiểu `String` + DEFAULT khớp hằng shared
   (`SETTINGS_THEMES/DENSITIES/FONT_SIZES/LOCALES`). Không JSON blob: bộ giá trị cố định của
   v0.2, thêm mục mới là migration expand; cột tường minh đọc/ghi được bằng SQL thường và
   không cần zod khi migration.
2. **Hàng tạo LAZY**: `GET /users/me/settings` khi chưa có hàng trả DTO mặc định ở tầng
   service, **không ghi**; chỉ `PATCH` upsert. Không rác hàng cho user không đụng cài đặt, xóa
   tài khoản không để lại gì phải dọn. Mặc định phải khớp DEFAULT của cột (một nguồn mỗi phía).
3. **PATCH semantics**: gửi trường nào đổi trường đó (`updateUserSettingsSchema` refine chặn
   body rỗng, zod strip field lạ → 400 `VALIDATION_ERROR`); create điền mặc định cho trường
   không gửi, update chỉ mang trường được gửi (Prisma 7 không nhận `undefined` trong data).
4. **Theme bằng `data-theme` trên `<html>`**, không `.dark` class: `'dark'` buộc tối,
   `'light'` buộc sáng (kể cả khi OS tối), `'system'` theo `prefers-color-scheme` như ADR-0023.
   `@custom-variant dark` của Tailwind mở rộng cho cả hai điều kiện; token tối giữ nguyên bảng
   màu, khối `html[data-theme='dark']` nhân bản khối `@media` (CSS không gộp được selector với
   @media) — sửa một nơi phải sửa cả hai, ghi chú tại chỗ. antd resolve mode hiệu dụng ở
   `ThemeProvider` (dark/light theo OS khi system).
5. **Mật độ + cỡ chữ bằng biến CSS, không class rải rác**: `data-density` (comfortable/compact)
   đổi `--ping-message-py`/`--ping-message-leading` (khối tin dùng
   `py-(--ping-message-py)`); `data-font` (sm/md/lg) đổi `font-size` gốc trên `html`
   (93.75/100/112.5%) nên mọi khoảng cách theo rem co theo, contrast a11y không đổi.
6. **Store thiết bị `ping.settings.applied`** (localStorage, chỉ 3 trường giao diện): nguồn
   khởi tạo để tab mới mở đúng màu ngay, tránh nháy sáng→tối trong lúc chờ GET. Server vẫn là
   nguồn sự thật: `SettingsSync` bơm giá trị server sau khi đăng nhập và ghi đè cache thiết bị.
   PATCH áp dụng optimistic lên store + cache TanStack, lỗi server trả cả hai về bản trước.
7. **Ngôn ngữ: cookie là nguồn render, server là nguồn đồng bộ khi người dùng chọn.** Trang
   Ngôn ngữ PATCH `locale` rồi ghi cookie + reload (Next server components đọc cookie). Đổi
   ngôn ngữ ở thiết bị khác **không tự đổi** trang đang mở — cookie của thiết bị là lựa chọn
   hiển thị cục bộ (LanguageSwitcher hiện có cũng chỉ ghi cookie); người dùng chọn lại một lần
   là đồng bộ. Ghi nhận là giới hạn đã biết thay vì tự reload vòng lặp (server 'vi' mặc định
   sẽ đè lựa chọn 'en' cục bộ của người dùng chưa từng PATCH).
8. **Bổ sung hai endpoint đọc user-scoped** (route `me`, không id trên path): `GET
/users/me/privacy` trả `{dmAllow}` (TG.9 chỉ có PATCH → switch cài đặt không đọc được giá
   trị đã lưu) và `GET /users/me/blocks` trả danh sách `BlockedUserDto` mới nhất trước (TG.9 ghi
   "danh sách chặn toàn cục thuộc TG.13"). `DELETE /users/:userId/block` của TG.9 tái dùng cho
   bỏ chặn. Không vào `ID_ROUTES` được vì không có tham số id; cách ly user phủ trong e2e riêng.
9. **Phân chia cài đặt thiết bị vs server**: âm thanh, quyền Notification API (trạng thái trình
   duyệt), "bỏ qua @everyone" ở localStorage như TG.12; mức/mute server/channel giữ ở API.
   Trang Thông báo chỉ gom UI về một chỗ (giá trị không đổi nguồn).
10. **Tài khoản**: hồ sơ tái dùng thẻ TG.7; email/mật khẩu/phiên là placeholder **không bấm
    được** (không dựng UI giả) — thuộc TG.8 (vòng đời tài khoản) theo thứ tự Pha G.

## Alternatives

- JSON blob `settings` trên `User`: linh hoạt nhưng mất kiểu/kiểm ở DB, query khó, không lợi gì
  khi bộ giá trị cố định trong v0.2 — loại.
- `.dark` class + `next-themes`: thêm dependency và script chống nháy; `data-theme` + một
  store nhỏ đủ cho hai chế độ và giữ ADR-0023 (không `.dark`) gần nhất — loại.
- Lưu cài đặt trong cookie/localStorage hoàn toàn: không đồng bộ thiết bị (tiêu chí TG.13) —
  loại.
- Tự áp `locale` server khi boot (khi cookie lệch): sẽ đè lựa chọn ngôn ngữ cục bộ của người
  dùng chưa từng PATCH (server 'vi' mặc định) và có nguy cơ reload vòng lặp — loại, ghi giới
  hạn ở mục 7.
- Gộp `dmAllow` vào DTO settings: hai bảng, hai endpoint ghi khác nhau (User vs UserSettings) —
  dễ PATCH sai chỗ; giữ endpoint riêng theo ADR-0070 — loại.

## Consequences

- Theme/mật độ/cỡ chữ áp dụng tức thời trên mọi trang (attr trên `<html>`), đồng bộ khi tải
  trang ở thiết bị khác; ngôn ngữ cần người dùng chọn lại trên thiết bị mới (mục 7).
- Khối token tối bị nhân bản một lần trong `globals.css`; sửa palette phải sửa cả hai khối —
  rủi ro lệch được ghi chú ngay tại khối thứ hai và e2e/axe sáng+tối bắt được hậu quả.
- `data-*` trên `<html>` là DOM API — `ThemeProvider` phải đồng bộ trong effect (React không
  thấy DOM); store đọc localStorage ở module client nên HTML server/client có thể khác attr
  trước hydration, chấp nhận (giống hành vi `detectMode` cũ) vì đó chính là cơ chế chống nháy.
- e2e: đổi theme ở tab A → GET API xác nhận → tab B (context riêng, thiết bị khác) tải trang
  nhận theme; PATCH `theme:'blue'` → 400; switch `dmAllow` tải lại vẫn đúng nhờ GET mới.
- Mở tương lai: thêm mục cài đặt = một cột + migration expand + hằng shared; TG.8 thay
  placeholder Tài khoản bằng luồng thật (email/mật khẩu/phiên).
