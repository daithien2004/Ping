# ADR-0053: Tệp riêng trên đĩa và pipeline upload có kiểm định

Status: accepted — OWNER duyệt phương án TG.6 ngày 2026-10-26
Date: 2026-10-26

## Context

TG.6 cần upload/đính kèm, hạn mức, URL ký và xử lý ảnh trong worker. ADR-0059 hoãn hạ tầng
trả phí. Task TG.7/TG.22/TG.24 sẽ tái sử dụng pipeline, nhưng chưa triển khai trong task này.

## Decision

- `Storage` là cổng đọc/ghi/xóa; `LocalStorage` ghi atomic qua file tạm cùng thư mục. Khóa do server
  tạo từ UUID, không dùng tên/path của client. Mặc định dev `../../.uploads` (từ `apps/api`);
  container `/app/uploads`, volume riêng dùng chung API/worker. Không có static route cho volume.
  Tệp và thư mục không được đưa vào Git hay Docker build context.
- Postgres giữ metadata, reservation và queue: `pending → uploaded → queued → ready/rejected`.
  PUT nhị phân ≤ 10 MiB có timeout 30 giây, chỉ uploader có quyền tạo Attachment mới được ghi;
  lần ghi đầu làm tệp immutable. Complete idempotent chuyển `uploaded → queued`.
  Worker riêng lấy một hàng bằng `FOR UPDATE SKIP LOCKED`, transaction rollback khi crash;
  lỗi storage/DB retry sau 30 giây, không gắn nhãn tệp độc hại cho lỗi hạ tầng.
- Chỉ nhận JPEG/PNG/WebP tĩnh và PDF 1.x trong tập con bảo thủ. `file-type@22.1.1` kiểm magic
  bytes; `sharp@0.35.5` giải mã, giới hạn 16 triệu pixel, reencode WebP không metadata, thumbnail
  tối đa 320×240. Ảnh có đuôi payload ngoài marker kết thúc bị từ chối; chỉ bản canonical được
  phục vụ. Tổng ảnh canonical + thumbnail ≤ 10 MiB. Không nhận SVG/HTML/executable/archive/GIF.
- PDF bắt buộc header, xref, EOF; từ chối active/embedded/encrypted content, escaped names,
  HTML/script và ZIP signature. Đây là bộ lọc bảo thủ, **không phải antivirus hay bộ chứng minh
  mọi PDF an toàn**; không giải nén/đọc nội dung PDF để index, không preview trong iframe.
  PDF luôn tải dạng attachment, `nosniff`, CSP sandbox. File name download dùng encoding UTF-8.
- Shared schemas/errors/DTO/ability ở `@ping/shared`. `Attachment` cần VIEW_CHANNEL để xem,
  thêm SEND_MESSAGES để upload. Tối đa 5 tệp/tin; tin chỉ có tệp được phép. Gắn tệp kiểm uploader,
  channel, ready, chưa gắn trước đó trong transaction có row lock. Nonce tin/upload chống retry.
- Quota mặc định 100 MiB/user và 1 GiB/server, chỉnh bằng
  `ATTACHMENT_USER_QUOTA_BYTES`/`ATTACHMENT_SERVER_QUOTA_BYTES`. Khóa advisory theo user rồi
  server bảo vệ reserve đồng thời. Pending giữ `sizeBytes + 10 MiB`, đủ original và output lớn
  nhất; sau xử lý giữ dung lượng thật của original + output, sau dọn original chỉ tính output.
  Do đó một tệp nhỏ đang chờ cũng tạm giữ hơn 10 MiB. Hàng rejected/deleted không tính quota;
  deleting vẫn tính cho tới khi dọn xong. `sizeBytes` DTO là dung lượng **tệp gốc**.
- URL tải ký HMAC-SHA256 có prefix riêng, ràng buộc attachment/user/variant/expiry, hạn 60 giây;
  endpoint file xác thực chữ ký rồi **đọc quyền/membership mới từ Postgres**, bỏ cache quyền
  Redis. Tệp chưa gắn chỉ uploader xem; tin đã xóa hoặc channel đã mất không tải được. URL là
  bearer capability có thể chia sẻ trong thời hạn; không phải chứng minh danh tính người cầm URL.
  Dùng `private, no-store`, referrer policy; access log bỏ query, Sentry scrubber đã bỏ query.
- UI giữ File/progress/ID lựa chọn trong draft; TanStack mutation chạy upload, query lấy link.
  URL được làm mới trước hạn; trạng thái chưa ready/lỗi chặn gửi. UI có chọn, kéo thả, dán ảnh,
  tiến độ, hủy, hiển thị lỗi, thumbnail và lightbox; i18n vi/en. Cache tin giữ ID để retry tin lỗi.
- Dọn upload chưa gắn quá một giờ (kể cả ready), tệp thuộc tin đã xóa và channel đã mất. Scope ID
  không có FK cascade để metadata dọn tệp còn sau khi xóa server/user. FK message dùng SET NULL.
  Original chỉ bị dọn sau khi transaction ready commit; trạng thái `rawRemoved` làm công việc
  bền qua restart, không quét lại mọi tệp đã ready. Backup nhất quán bao phủ DB + volume.
- Metrics `attachment_jobs_total{outcome=ready|rejected|deleted|retry}` và
  `dependency_up{name="attachment_storage"}`. Không đưa filename/user/token vào label hay log.
  Worker mở cổng metrics nội bộ `METRICS_PORT` (ADR-0031) và compose mẫu dùng nó làm healthcheck
  cho service worker.

## Alternatives

- S3 thuê ngoài: hoãn theo ADR-0059; có thể thêm adapter sau, không phát sinh chi phí lúc này.
- Public static directory: không đáp ứng quyền/URL hết hạn, loại.
- Redis-only queue/reservation: mất Redis không được mất trạng thái bền hoặc vượt quota, loại.
- Chấp nhận mọi file với MIME client: không đáp ứng tiêu chí kiểm định, loại.

## Consequences

Các replica API/worker phải cùng truy cập volume; chưa hỗ trợ nhiều VPS có đĩa riêng. Local disk
không có độ bền độc lập với máy chủ; backup ngoài máy và restore staging thuộc pha vận hành.
Không có antivirus trong v0.2.0 theo plan; PDF tải xuống vẫn cần phần mềm đọc được cập nhật.

Nguồn API đối chiếu phiên bản: [sharp output](https://sharp.pixelplumbing.com/api-output/),
[file-type](https://github.com/sindresorhus/file-type),
[Nest StreamableFile](https://docs.nestjs.com/techniques/streaming-files); Next client boundary đọc
từ docs đi kèm package cài trong repo. Kết quả chạy thật ở evidence TG.6.
