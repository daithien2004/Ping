# Evidence TG.12 — Thông báo (mute, mức, Notification trình duyệt, badge)

- Ngày: 2026-10-29 (Asia/Saigon); nhánh `feat/tg12-notifications`; base `e4940c6` (main sau TG.9).
- Không cần ADR theo kế hoạch (cột "PR"); thiết kế chốt trong hợp đồng shared + brief:
  mức + mute lưu **phía API** (mute hiệu lực mọi thiết bị — tiêu chí nghiệm thu), âm thanh và
  quyền Notification là **thiết bị-riêng** (client).

## Đã giao

**Shared** (commit hợp đồng đầu nhánh):

- `schemas/notification.ts`: `NOTIFY_LEVELS ['all','mentions','none']`,
  `NOTIFY_DEFAULT_LEVEL = 'all'` (không cấu hình gì → hành vi badge giữ nguyên),
  `setNotificationPrefSchema {level, mutedUntil ISO+offset|null}`,
  `NotificationPrefDto {scope, targetId, level, mutedUntil}`, hàm thuần
  `shouldNotify` (none tắt hẳn; mute trong tương lai chặn cả mention; @everyone tùy
  `ignoreEveryone`). Bắt được lỗi thật khi soạn: `z.datetime` không tồn tại trong zod 4 →
  `z.iso.datetime({offset: true})`. Shared unit **65/65** (+4).

**API** (commit sau review):

- Migration expand `20261029041523_tg12_notification_prefs`: bảng `NotificationPref` unique
  `(userId, scope, targetId)` — một dòng prefs duy nhất mỗi user mỗi target; không FK tới
  Server/Channel (prefs sống khi target chết, vô hại vì client không hỏi nữa — comment ghi rõ).
- `GET/PUT/DELETE /users/me/notification-prefs/{server,channel}/:targetId` — JWT-only,
  **user-scoped chặt** (mọi truy vấn khóa `userId` từ JWT, không bao giờ từ path); upsert theo
  unique không nhân dòng; DELETE idempotent 204; `mutedUntil` ISO+offset → Date → toISOString
  tròn vẹn (e2e xác minh `+07:00` đọc lại UTC khớp DB); target lạ → 404; không kiểm member
  (prefs là dữ liệu của người gọi, hàng vô hại — comment lý do).
- Server CHỈ lưu và đọc lại — badge/notification do client tính từ `shouldNotify`; không
  event/realtime (client fetch một lần khi boot).
- Unit +7 (suite **245/245**), e2e **9/9** (GET rỗng → PUT 2 scope → upsert → DELETE → 404 →
  401 → mutedUntil tròn vẹn → IDOR cách ly 2 user → body sai 400), IDOR **47 → 51** (4 route
  prefs — rule 16; không bảng tấn công vì không có dữ liệu người khác, cách ly user trong
  e2e riêng).

**Web** (commit sau review):

- `features/notifications/`: api (zod parse ở biên), `notification-cache.ts` thuần
  (`effectiveLevel`/`effectiveMutedUntil` channel → server → default, `remainingMuteMinutes`,
  `mentionFlags`, `hasEveryoneToken` regex cùng ranh giới từ với mention-parser API), hooks.
- **Chuông** ở header channel + header DM: 3 mức + nhóm mute 15 phút/1 giờ/3 giờ/8 giờ/
  24 giờ/Bỏ mute (gửi kèm level hiện hành), nhãn "theo mặc định server/chung" khi override
  không tồn tại; footer PingSwitch "Bỏ qua @everyone" (localStorage, mặc định false — tùy
  chọn toàn cục người dùng của TG.12, trang cài đặt đầy đủ thuộc TG.13). Server-level UI bỏ
  qua v0.2 (rail không có menu ngữ cảnh server; API/hook hỗ trợ đủ scope server).
- **Notification trình duyệt**: nút xin quyền SAU thao tác người dùng ở chân rail (chỉ hiện
  khi `default`; denied → nhãn mờ đạt contrast ≥4.5:1 qua axe); bắn **CHỈ khi
  `document.hidden === true`** (tiêu chí nghiệm thu) AND `shouldNotify()` nguyên vẹn của
  shared; `isMention` từ event `mention.created` (room `user:<id>` — cùng nguồn sự thật với
  unread T4.3; đếm messageId chống bắn đôi); `@everyone/@here` từ content tin fetch về;
  DM coi như mention-style (ADR-0070 mục 7). Gom thông báo `tag: channelId`; click → focus +
  permalink (`messagePath`/`dmMessagePath` của TG.9); body = tác giả + trích content.
- **Badge**: `document.title = '(N) Ping'` theo tổng unread server + DM (unseen hooks — ngữ
  nghĩa đổi từ tổng mention; cập nhật assertion unread-ui); favicon vẽ chấm đỏ canvas,
  khôi phục khi n=0, không đụng tệp gốc. Âm thanh: beep WebAudio khi bắn notification,
  toggle localStorage mặc định BẬT, không phát khi focus.
- **Bug thật bắt được khi đổi ngữ nghĩa title**: tin mention bị đếm ĐÔI unread
  (`MentionCreated` bump trùng `channel.activity`) — sửa gốc `countsUnread: false` trong
  `applyIncoming` + test.
- i18n vi/en (namespace `notifications`, 28 key); a11y aria-label + axe sáng/tối.

## Kiểm chứng

| Hạng mục                           | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit                        | **65/65** (+4 notification)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| API unit                           | **245/245** (31 file; +7 notifications)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| API e2e `notification-prefs`       | **9/9** (chi tiết trên)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| IDOR                               | 51 route (+4 prefs), pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Web unit                           | **230/230** (+20: cache thuần + fix đếm đôi)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Web e2e `notification`             | **4 lần chạy liên tiếp xanh** (~30 s/lần): bell đặt mentions + mute 15 phút → API row khớp (mutedUntil 13–16 phút); mention khi tab ẩn → entry đúng tag/title/body, click tới permalink; kênh mute không sinh entry + tab focus không sinh entry (ẩn lại thì bắn); title tăng khi unread, về `Ping` khi đọc                                                                                                                                                                                             |
| Full API e2e                       | **329/329 (39 file, 181 s)** — trước TG.12: 320/320 (38 file)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Full web e2e                       | **46 pass + 1 skip (20,0 phút)**; 3 fail trong run, trong đó **profile.spec đỏ cả khi chạy riêng — KHÔNG phải ô nhiễm**: chuông TG.12 mang label "Cài đặt thông báo kênh" chứa chuỗi "Cài đặt" mà profile.spec click theo substring → strict mode violation. Vá `08fcaed` đổi nhãn "Thông báo kênh"/"Thông báo hội thoại" (en rút gọn tương tự); profile + notification + unread-ui + auth-and-shell xanh lại; 2 fail còn lại (auth-and-shell, unread-ui) xanh khi chạy riêng (ô nhiễm DB theo tiền lệ) |
| Lint/format/typecheck/build/bundle | lint 0 error; prettier sạch; typecheck sạch; build prod web đạt; **bundle 247,4 KB ≤ 450 KB** (+0,3 KB so với TG.9)                                                                                                                                                                                                                                                                                                                                                                                     |
| Migration                          | `20261029041523_tg12_notification_prefs` apply, in sync; `migrate diff --exit-code` no difference                                                                                                                                                                                                                                                                                                                                                                                                       |

## Lưu ý / quyết định sản phẩm

- Mức `mentions`/`none` KHÔNG đổi badge unread (badge vẫn đếm mọi tin) — badge là "có gì mới
  để xem", mức thông báo là "đủ quan trọng để báo ngoài tab"; nếu muốn badge đổi theo mức là
  quyết định sản phẩm riêng, không thuộc TG.12.
- Edge nhỏ đã biết: tin chứa cả `@alice` lẫn `@everyone` với ignoreEveryone BẬT → không thông
  báo (chọn nghiêm phía người dùng); resetPref có trong api.ts nhưng UI để TG.13.
