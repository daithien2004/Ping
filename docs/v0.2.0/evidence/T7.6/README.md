# T7.6 — Điền cổng nghiệm thu v0.2.0 theo mục 12

- Ngày/múi giờ: 2026-11-01 (Asia/Saigon).
- Người thực hiện: agent (Qoder); OWNER duyệt nội dung lô gộp 3 trong phiên.
- Task, nhánh: T7.6 — `feat/batch3-tf13-tf15-t7`, base `3ed2ff4` (main sau lô 2), PR nháp local.
- Commit chứa bằng chứng: commit T7.6 của lô 3 (xem `git log`).
- Môi trường: Windows 11, Node 24.18.0, pnpm 10.26.0; kiểm tài liệu chạy local, không cần DB/Redis.
- Phạm vi: [acceptance/v0.2.0.md](../../acceptance/v0.2.0.md) thay bảng khung T0.4 bằng checklist từng mục của
  mục 12 kế hoạch local; không đổi tiêu chí, không hạ ngưỡng.

## Thay đổi

- Viết lại [cổng nghiệm thu](../../acceptance/v0.2.0.md): 9 mục Vận hành, 5 Kỹ thuật, 16 Tính năng &
  giao diện, 3 Hồ sơ phỏng vấn — mỗi dòng có trạng thái, bằng chứng (task + link), và phần chờ/rủi ro.
- Bổ sung bảng quyết định OWNER còn trống (mục 14 kế hoạch) và 8 rủi ro phải chấp nhận nếu nghiệm
  thu hôm nay.
- Trạng thái tổng vẫn là **chưa nghiệm thu**; không mục nào được đánh dấu đạt thay OWNER.

## Kiểm chứng

| Tiêu chí đạt                                    | Lệnh/cách thử                                                    | Kết quả | File log/ảnh/số đo      |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------- | ----------------------- |
| Mọi liên kết tương đối trong 2 tài liệu tồn tại | `pnpm docs:check`                                                | pass    | đầu ra lệnh trong phiên |
| Markdown + code đúng định dạng                  | `pnpm format:check`                                              | pass    | đầu ra lệnh trong phiên |
| Đủ số mục theo mục 12                           | `grep -cE '^\| V[0-9]+ '` … → V=9, K=5, F=16, H=3                | pass    | 33 mục                  |
| Không tự đánh dấu đạt mục staging               | đọc lại cột trạng thái: 0 mục `chưa kiểm` bị ghi thành `đạt`     | pass    | bảng mục 2–3            |
| Bằng chứng dẫn tới file có thật                 | `docs:check` phủ toàn bộ link; mọi link evidence/ADR đều resolve | pass    | —                       |

Logic/lỗi: `docs:check` báo 2 link hỏng tới `evidence/T7.6` và `evidence/T7.1` trước khi tạo hai
thư mục này; tạo xong chạy lại thì sạch. Không có số liệu nào được suy từ kế hoạch: mục chưa đo
(F14) và chưa chạy CI (F13) giữ nguyên trạng thái thiếu.

## Full gate local của lô gộp 3

Chạy trên head `feat/batch3-tf13-tf15-t7` (base `3ed2ff4`), Docker Postgres 17 + Redis 7 +
Mailpit + Qdrant, Windows 11. Một lượt cho cả lô theo quy ước gộp lô (không push nhánh giữa
các task).

| Check                            | Kết quả                                            | Ghi chú                                                                |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm format:check`              | pass                                               |                                                                        |
| `pnpm docs:check`                | pass                                               | 2 link hỏng được bắt và sửa trong lô                                   |
| `pnpm lint`                      | pass                                               | sửa `no-assign-module-variable` ở `scripts/bundle-routes.mjs`          |
| `pnpm typecheck`                 | pass                                               |                                                                        |
| `pnpm test`                      | shared **80/80**, API **307/307**, web **271/271** |                                                                        |
| `pnpm build`                     | pass (3/3)                                         |                                                                        |
| `pnpm --filter web check:bundle` | **248,2 KB** gzip ban đầu ≤ 450 KB, dư 201,8 KB    | [TF.15](../TF.15/README.md)                                            |
| API e2e                          | **365/365** (43 file)                              | Mailpit bật (bộ account-lifecycle cần thư thật)                        |
| Web e2e (production)             | **62 pass + 1 skip**, 26,0 phút                    | phải tắt API/web cũ trước khi chạy (xem lỗi bên dưới)                  |
| Visual regression                | **12/12**, 2,3 phút                                | DB sạch `ping_visual` (migrate + seed), không dùng DB dev chung `ping` |

**Lỗi thật gặp trong gate và cách xử lý:**

- Web e2e production hỏng ở `global-setup` (`seed-messages failed`, FK
  `Message_channelId_fkey`): API cũ còn sống ở cổng 4000 trỏ `ping_demo` được Playwright tái sử
  dụng (`reuseExistingServer`), nên server/kênh tạo ở `ping_demo` còn seed ghi vào `ping`. Xử lý:
  tắt API/worker cũ, xác nhận cổng trống rồi chạy lại → 62 pass. Bài học đã có trong
  [demo.md](../../demo.md) §1.2; không đổi code vì đây là môi trường, không phải sản phẩm.
- Visual regression đỏ 6/6 màn chính khi vô tình chạy trên DB dev chung `ping`: kênh #general
  tích 92 tin (chat tay/test), tin seed trôi khỏi trang mặc định và ảnh lệch baseline. Đã sửa
  thông báo lỗi của `visual/global-setup.ts` để chỉ đúng cách chạy (DB sạch vừa migrate + seed)
  và bổ sung lệnh cụ thể vào [TF.13](../TF.13/README.md); chạy lại trên `ping_visual` → 12/12.

## Review, giới hạn và tiếp tục

- **Chưa đóng được**: V1–V9 (staging/backup/Sentry/load/chaos), H2 (pilot), H3 (OWNER ký + tag).
  Đây là các mục gắn với hạ tầng trả phí đã dời theo ADR-0059 và với người thật, không phải thiếu sót agent.
- **Chờ OWNER**: F12 (TF.14) chưa ký; ADR-0039 (presence) còn `proposed`; ngân sách/kênh cảnh báo
  chưa điền; quyết định tag v0.2.0.
- **Chưa đo**: F14 — 10.000 tin cuộn mượt/long task > 50 ms (ghi từ TF.6, chưa có Performance trace).
- **Chưa chạy**: F13 job `visual` lần đầu trên CI Linux (bootstrap baseline); K5 xác nhận 6 check
  xanh trên đúng commit merge.
- **Nợ kỹ thuật mới ghi nhận**: F16 — trang `/dev/ui` liệt kê 12/33 wrapper, ảnh visual phủ màn hình
  chứ không theo từng wrapper.
- Cách chạy lại: `pnpm docs:check && pnpm format:check`; mở
  [acceptance/v0.2.0.md](../../acceptance/v0.2.0.md) đối chiếu từng dòng với task evidence.
- Bước tiếp theo: sau full gate + merge/push lô 3, cập nhật K5/F13 theo kết quả CI thật; khi OWNER
  ký TF.14 và pilot xong, cập nhật F12/H2 rồi mới bàn tag.
