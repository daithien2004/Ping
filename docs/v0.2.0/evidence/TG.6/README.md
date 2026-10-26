# Evidence TG.6 — Upload và đính kèm

- Ngày: 2026-10-26 (Asia/Saigon); base `ba98152`, nhánh `feat/tg6-attachments`.
- Thiết kế: [ADR-0053](../../../adr/0053-file-storage-and-upload-pipeline.md).
- Phạm vi: yêu cầu upload → PUT nhị phân → complete → worker kiểm định/ảnh → `ready`; gắn tối đa
  5 tệp/tin; URL ký hạn ngắn; hạn mức user/server; dọn tệp mồ côi; UI chọn/kéo thả/dán/tiến độ/
  hủy/lightbox; compose mẫu thêm `worker` + volume `uploads`; backup runbook bao phủ volume.

## Test trước implementation

- Shared: tin `content: ''` với attachment hợp lệ bị schema cũ từ chối (expected true, got false).
- API: bước mã hóa lại ảnh/thumbnail thất bại với implementation stub `Not implemented`.
- Sau implementation: bộ test quarantine xanh; kiểm EXIF bị bỏ, thumbnail, tệp giả và ảnh có
  HTML nối đuôi. Không coi lỗi import thiếu module là bằng chứng test hành vi đỏ.

## Kết quả kiểm chứng (ngày 2026-10-26)

Bộ lệnh chuẩn trên máy dev (Windows, Docker Desktop):

| Bộ kiểm                             | Kết quả                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `format:check`                      | Xanh (5 file của task đã format)                                                                      |
| `lint`                              | Xanh sau khi chuyển `onDragOver`/`onDrop` khỏi div `role="group"` sang `PingTextArea` (xem Phát hiện) |
| `typecheck`                         | Xanh                                                                                                  |
| `docs:check`                        | Xanh                                                                                                  |
| Unit: shared / api / web / workflow | 37 / 203 / 194 / 27 pass                                                                              |
| `build` + `check:bundle`            | JS tải ban đầu **245.7 KB** gzip (ngưỡng 450 KB; TG.3: 245.1 KB, +0.6 KB do UI đính kèm)              |
| API e2e                             | **272/272** pass, 33 file (attachments 8/8) trên Postgres/Redis thật và đĩa thật                      |
| Web e2e (WEB_PORT=3110)             | 35 pass / 3 fail đã pass khi chạy riêng / 1 skip; `attachment` pass trong run toàn cục                |

- API e2e `attachments` (8 test): reserve idempotent theo nonce, chặn hoàn tất trước khi có bytes,
  download `pending` 404, người khác không đụng được upload; ảnh reencode WebP không EXIF có
  width/height, tin chỉ có tệp gửi được và idempotent theo nonce, từ chối `attachmentIds` sai;
  SVG/`%PDF` có JavaScript bị worker rejected và không thể gắn; reserve hạn mức nguyên tử khi
  concurrent (1 nhận 201, 1 nhận 400 `UPLOAD_QUOTA_EXCEEDED`); dọn pending quá 1 giờ, hủy
  idempotent; lỗi đĩa → retry `nextRetryAt` 30 giây không gắn nhãn tệp độc hại, rồi ready khi đĩa
  khỏe lại; PDF luôn `Content-Disposition: attachment` + `nosniff`, thành viên rời server **mất
  quyền tải ngay** dù URL ký còn hạn (403).
- Metrics đọc qua cổng metrics thật trong e2e: `attachment_jobs_total{outcome="ready"} ≥ 2`,
  `rejected = 2`, `deleted ≥ 2`, `dependency_up{name="attachment_storage"} 1`.
- Web e2e `attachment` (Playwright, production build): chọn tệp, từ chối tệp giả hiển thị lỗi từng
  file, hủy, gửi tin có ảnh, realtime sang tab thứ hai, lightbox + axe sạch cả sáng/tối, ảnh chụp
  [lightbox.png](lightbox.png), reload trang vẫn hiện ảnh. Ba spec flake (`i18n`, `members`,
  `unread-ui`) pass khi chạy riêng — cùng pattern 429 run toàn cục đã ghi nhận từ TG.1; CI chia
  3 shard nên là cổng xác nhận.

## Smoke container (ADR-0032)

- Dựng lại stack mẫu `-p pingprod` với compose mới (thêm service `worker` + volume `uploads`);
  `migrate` thoát 0, api/web/nginx healthy, `nginx -t` đạt.
- `test/smoke/prod-stack.mjs` qua HTTPS (TLS local): web + lỗi API có requestId + refresh/logout +
  socket ACK + realtime + presence — pass.
- Kiểm chứng riêng luồng attachment **xuyên container** (API ghi volume, worker container xử lý):
  register → tạo server → reserve → PUT bytes → complete → worker container chuyển `ready` → URL
  ký → tải 84 B `image/webp`. Volume dùng chung API/worker hoạt động.

## Phát hiện trong task

- `POST /servers/:id/leave` trả `204` (không phải 201) theo spec servers có sẵn — spec mới đã
  chỉnh theo.
- ESLint `jsx-a11y/no-noninteractive-element-interactions` cấm `onDragOver`/`onDrop` trên div
  `role="group"` (thuộc nhóm handler "mouse"; `onPaste` thuộc nhóm "clipboard" thì không) — kéo
  thả chuyển vào `PingTextArea` (phần tử tương tác), `PingTextArea` thêm prop `onDragOver/onDrop`.
- antd `TextArea` forward props lạ xuống textarea DOM nên kéo thả hoạt động không cần sửa thư viện.

## Dữ liệu smoke

- pingprod là môi trường luyện tập: 3 tài khoản smoke (dbg/smoke) và 1 server "TG6 smoke" ở lại
  trong DB luyện tập, không phải DB dev; tệp trên volume sẽ bị worker dọn khi server bị xóa.
