# Evidence TG.7 — Avatar, icon server, hồ sơ

- Ngày: 2026-10-27 (Asia/Saigon); base `6c5b1d9`, nhánh `feat/tg7-profile`.
- Thiết kế: tái sử dụng [ADR-0053](../../../adr/0053-file-storage-and-upload-pipeline.md) (mục
  Context ghi rõ TG.7 dùng lại pipeline upload); ADR mới không cần — không đổi quyết định cũ,
  chỉ mở rộng `Attachment.scope` (migration expand).
- Phạm vi: `PATCH /users/me` (displayName + avatar), `PATCH /servers/:id/members/me` (nickname
  của chính mình, bit `CHANGE_NICKNAME` mới, backfill `@everyone`), icon server qua
  `PATCH /servers/:id` (quyền `update Server` + audit `SERVER_UPDATE` kèm `iconChanged`); event
  `user.updated`/`member.updated`/`server.updated`; UI thẻ hồ sơ (modal) ở rail + danh sách
  thành viên; fallback chữ cái nhất quán; nút "Nhắn tin" để tắt kèm giải thích (DM thuộc TG.9).
- Trạng thái: kiểm chứng local hoàn tất; merge/push theo pattern phiên.

## Thiết kế chính

- `Attachment` mở cho hồ sơ: cột `scope` ('message' mặc định | 'avatar' | 'serverIcon') +
  `boundAt` (một tệp hồ sơ chỉ gắn một lần); `channelId`/`serverId` thành nullable (avatar không
  thuộc server nào). Migration expand, không xóa gì.
- Upload hồ sơ đi đúng pipeline TG.6 (reserve → PUT → complete → worker kiểm định); worker
  từ chối PDF cho scope hồ sơ (chỉ ảnh tĩnh), dọn mồ côi theo scope (tin xóa/kênh mất với
  message; server mất với serverIcon; uploader mất với avatar; pending > 1 giờ mọi scope).
- URL hồ sơ (`attachment-profile-v1`) sống 30 ngày, ràng buộc attachment + variant, KHÔNG ràng
  buộc người xem — payload event và cache client render được ngay bằng `<img>` (bearer capability
  theo ADR-0053; chỉ scope hồ sơ, ảnh đã reencode). Thay avatar/icon mới → tệp cũ chuyển
  `deleting`, worker dọn tệp và giải phóng hạn mức.
- Ability guard phân biệt rõ: attachment profile-scope → bỏ qua kiểm quyền theo server
  (ownership do `AttachmentsService.owned()` kiểm), khác với "không xác định được server"
  (fail closed như cũ).

## Kiểm chứng (máy dev, Windows + Docker Desktop)

| Bộ kiểm                                              | Kết quả                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `format:check` / `lint` / `typecheck` / `docs:check` | Xanh                                                                                                                 |
| Unit: shared / api / web / workflow                  | 43 (6 file) / 203 / 199 / 27 pass                                                                                    |
| `build` + `check:bundle`                             | JS tải ban đầu **246.1 KB** gzip (ngưỡng 450 KB; TG.6: 245.7 KB)                                                     |
| API e2e                                              | **277/277** pass, 34 file (mới: `profile` 5 test; `attachments` 8/8 vẫn xanh; IDOR 39 route)                         |
| Web e2e (WEB_PORT=3110)                              | 38 pass / 1 fail cuối run (`Network error` khi burst kết nối cuối run — `profile` pass ngay khi chạy riêng) / 1 skip |

- API e2e `profile`: gắn avatar ready → PATCH trả `avatarUrl` → GET URL không cần token → 200
  `image/webp` không EXIF; gắn lại cùng tệp → 400 `ATTACHMENT_ALREADY_BOUND`; thay avatar mới →
  tệp cũ về `deleted` qua worker; PDF giả làm avatar → rejected; quá 5 MiB → 400; đổi displayName +
  nickname của chính mình (null để xóa); người ngoài server → 403; icon server cần quyền quản lý
  (upload scope serverIcon của member thường → 403) và audit có `iconChanged: true`.
- Web e2e `profile`: đăng ký tài khoản RIÊNG (không đụng account seed — đã từng làm bẩn
  `alice@ping.dev` làm spec khác đỏ, đã sửa + khôi phục DB), đổi avatar + displayName từ modal →
  rail đổi ngay, tab của bob nhận `user.updated` (tên + ảnh) không reload; biệt danh qua thẻ
  thành viên; icon server qua bề mặt quản trị → rail đổi icon; ảnh chụp
  [avatar-rail.png](avatar-rail.png).

## Phát hiện trong task

- **antd Popover đặt vị trí sai trong layout rail** (popup `left: -12800px`): nút Lưu nằm ngoài
  viewport, click "thành công" nhưng rơi vào chỗ khác → popover đóng mà onClick không chạy.
  Khắc phục bằng cách dùng **PingModal** (pattern đã kiểm chứng của repo) cho thẻ hồ sơ — luôn
  nằm trong viewport, thân thiện axe. Bài học: đừng anchor popup vào phần tử ở mép đáy rail.
- **Abort-on-unmount giết vòng poll upload**: cleanup `abort()` trong `useEffect` của hook
  upload làm vòng chờ `ready` tắt giữa chừng khi modal nội bộ tái tạo cây component. Bỏ abort
  (tệp không gắn sẽ bị worker dọn như mồ côi) — vòng poll sống qua re-render.
- e2e không được đổi hồ sơ account seed: tách tài khoản riêng cho spec đổi hồ sơ.
- `MyServerPermissions` của @everyone thêm bit 2048 → cập nhật kỳ vọng e2e my-permissions.

## Dữ liệu kiểm

- DB dev còn nguyên seed; các tài khoản/server probe của spec đã dọn (server xóa qua API,
  user/attachment xóa bằng SQL sau khi chạy).
