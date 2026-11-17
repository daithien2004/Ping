# ADR-0099: File đính kèm nằm trong object storage S3

Status: accepted (code xong; e2e đính kèm chạy trên CI sau khi push, chưa chạy cục bộ)
Date: 2026-11-17

## Context

File đính kèm nằm trong volume `uploads` mà các bản sao API và worker cùng gắn. Cách này chỉ đúng khi mọi tiến trình ở cùng một máy;
nó phá quy tắc "backend stateless" ngay khi có bản sao thứ hai ở máy khác ([ADR-0097](0097-hai-ban-sao-api-trong-compose-prod.md)).
Port `Storage` (`read/write/remove`) đã có sẵn nên đổi nơi lưu không đụng nghiệp vụ.

## Decision

1. `ObjectStorage` thay `LocalStorage` (xóa hẳn code cũ, không giữ cờ): `@aws-sdk/client-s3`, `forcePathStyle`, tạo bucket nếu chưa có lúc khởi động
   (lỗi chỉ cảnh báo, không chặn API). Cấu hình `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY`; dependency mới vì cần client chuẩn
   của giao thức S3, Node không có sẵn.
2. MinIO chạy trong compose dev (console 9001) và prod (chỉ trong mạng compose, khóa sinh ngẫu nhiên bởi `bootstrap.sh`; `deploy.sh` sinh bù khóa
   cho `.env.prod` có từ trước). Volume `uploads` bị bỏ khỏi compose.
3. API vẫn đứng giữa đường upload và download (kiểm quota, validate file, kiểm quyền trước khi trả byte). Phương án presigned URL (client tải thẳng
   từ storage, nhẹ cho API hơn) bị hoãn: nó đổi luồng quyền truy cập và cần ADR riêng.
4. `attachment_storage` trong `dependency_up` giờ kiểm bucket qua `registerDependency`, không còn kiểm thư mục.
5. `src/migrate-uploads.ts` (`node dist/migrate-uploads.js <thư mục cũ>`) chuyển file từ volume cũ sang bucket một lần, idempotent.

## Consequences

- Mọi tiến trình stateless, có thể nằm trên máy khác nhau.
- Thêm một dịch vụ (MinIO, ~100+ MB RAM) và một điểm chết cho upload/download: storage chết thì file trả 503, phần còn lại của API vẫn chạy.
- Ảnh `minio/minio` không còn kéo được từ Docker Hub (và quay.io từ chối); dùng `bitnamilegacy/minio:2025.4.22`, bản **dừng cập nhật bảo mật**.
  Chấp nhận được cho học tập và dev; nếu chạy production thật nên chuyển sang S3/R2/dịch vụ được duy trì.
- Dữ liệu cũ trên VPS (~85 KB) cần chạy `migrate-uploads` khi deploy lần đầu; chưa chạy.
- Chưa kiểm: test e2e đính kèm với MinIO (chạy trên CI), thông lượng upload so với đĩa cục bộ.
