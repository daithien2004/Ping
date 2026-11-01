# Bộ công cụ pilot v0.2.0 (T7.1)

Trạng thái: **bộ công cụ sẵn, pilot chưa chạy** — tạo 2026-11-01, nhánh
`feat/batch3-tf13-tf15-t7`, base `3ed2ff4`. Pilot thật cần **5–10 người trong 3–5 ngày** và một
môi trường dùng chung; agent không thể tự tạo hai điều kiện đó. Khi chạy xong, điền kết quả vào
[§6](#6-bảng-kết-quả) rồi cập nhật mục H2 của [cổng nghiệm thu](v0.2.0.md).

Mục tiêu: tìm lỗi **chặn luồng chính** và chỗ người mới bị kẹt, không thu thập dữ liệu thật và
không đánh giá gu thẩm mỹ. Pilot không thay nghiệm thu staging: các mục V1–V9 vẫn chờ hạ tầng.

## 1. Phạm vi luồng chính

Theo T7.1 và kịch bản [demo.md](../demo.md):

1. Đăng ký / đăng nhập, xác minh email (Mailpit ở bản LAN; thư thật chỉ khi có staging).
2. Tham gia server bằng mã mời; xem danh sách kênh.
3. Gửi tin, trả lời, thả cảm xúc, ghim, sửa/xóa tin của mình.
4. Tải tệp/ảnh, thấy trạng thái "Đang kiểm tra tệp…" → "Sẵn sàng gửi"; tải xuống.
5. Unread/mention: hai tab, badge, tab title, vạch tin mới.
6. Tìm kiếm có lọc; bấm kết quả nhảy tới tin.
7. Hỏi AI: câu trả lời có chip trích dẫn, bấm chip nhảy tới tin gốc; thử câu ngoài quyền.
8. Mất mạng 30–60 giây rồi gửi tiếp: không mất tin, không trùng, đúng thứ tự.
9. DM 1:1, chặn/bỏ chặn; đổi tên hiển thị, sáng/tối, vi/en, thu hồi phiên.

Không đưa vào pilot: thanh toán (không có), gọi thoại (không có), kiểm duyệt AI (T5.10 là [X]),
tóm tắt/hybrid (hoãn [S] theo ADR-0038 §6.2).

## 2. Môi trường

### 2.1. Phương án A — LAN tại máy dev (khả dụng ngay)

Dùng đúng stack production đã kiểm trong CI (`docker` job) nhưng bind ra LAN:

```bash
# DB riêng cho pilot, không dùng DB dev
docker exec ping-postgres-1 createdb -U ping ping_pilot
cd apps/api
DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_pilot" pnpm exec prisma migrate deploy
cd ../..
DATABASE_URL="postgresql://ping:ping@localhost:5432/ping_pilot" pnpm seed:demo
```

Làm theo [deploy.md](../../runbook/deploy.md) mục chạy production local, đổi:

- `BIND_ADDRESS=0.0.0.0` (mặc định runbook là `127.0.0.1`) để người trong LAN vào được.
- Giữ `HTTPS_PORT=8443` + chứng chỉ tự ký của `scripts/local-certificates.mjs`.
- `PUBLIC_URL=https://<IP-LAN>:8443` để link trong thư xác minh mở được từ máy khác.

Người tham gia mở `https://<IP-LAN>:8443`, bấm "Advanced → Proceed" một lần cho chứng chỉ tự ký.
**Không** mở cổng ra Internet, không dùng tên miền thật: chứng chỉ tự ký và chưa có backup/monitoring.

Giới hạn đã biết:

- Đăng ký bị giới hạn **5 lượt/phút/IP**; cả nhóm sau cùng một NAT nên phải đăng ký rải ra.
- Worker phải chạy cùng stack, nếu không tệp đứng ở "Đang kiểm tra tệp…" (lỗi đã gặp ở T7.4).
- Không có HTTPS công khai, không Sentry thật, không backup — mọi sự cố chỉ sửa được tại máy.

### 2.2. Phương án B — staging (khi OWNER bỏ hoãn ADR-0059)

Chỉ dùng sau khi T2.1–T2.11 xong (TLS công khai, backup, Sentry, deploy theo SHA). Khi đó đổi
`PUBLIC_URL` sang tên miền thật, dùng thư thật, và ghi rõ trong biên bản là môi trường staging.

## 3. Người và tài khoản

- 5–10 người, ưu tiên người **chưa từng xem sản phẩm**; ghi vai trò (dev/không dev) để đọc phản hồi đúng bối cảnh.
- Mỗi người tự đăng ký tài khoản riêng; không dùng chung `alice@ping.dev`.
- Seed có 3 server, 9 kênh, 21.600 tin, 4 tài khoản demo (`alice/bob/carol/david@ping.dev`, mật khẩu `password123`). Dùng `alice` làm quản trị để tạo mã mời; người tham gia join bằng mã mời.
- Một người giữ vai trò **điều phối** (không tính vào 5–10): phát mã mời, nhận bug, chụp ảnh, đối chiếu `requestId`.
- Đồng thuận trước khi bắt đầu: chỉ dùng dữ liệu giả; không tải tài liệu thật; ảnh chụp có thể lưu trong repo nội bộ; dữ liệu pilot xóa sau khi tổng hợp.

## 4. Lịch 3–5 ngày

| Ngày | Việc                                                                   | Ai làm                     | Bằng chứng cần giữ                          |
| ---- | ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------- |
| 0    | Dựng môi trường, seed, tạo mã mời; gửi hướng dẫn 1 trang + đồng thuận  | điều phối                  | ảnh stack, output seed, danh sách người     |
| 1    | Đăng ký, xác minh email, join server, gửi tin đầu tiên                 | người tham gia             | thời gian tới tin đầu, ảnh lỗi (nếu có)     |
| 2    | Trả lời, cảm xúc, ghim, tệp/ảnh; unread hai tab                        | người tham gia             | biểu mẫu phản hồi ngày 2                    |
| 3    | Tìm kiếm, permalink, DM + chặn, đổi tên hiển thị                       | người tham gia             | biểu mẫu ngày 3                             |
| 4    | Hỏi AI + chip trích dẫn; thử câu hỏi ngoài quyền; mất mạng rồi gửi lại | người tham gia             | biên bản câu hỏi AI, ảnh lỗi                |
| 5    | Phỏng vấn ngắn 10 phút/người; tổng hợp, phân loại bug; đóng môi trường | điều phối + người tham gia | biên bản, bảng kết quả, quyết định lỗi chặn |

Ngày 1–4 có thể gộp nếu người tham gia ít thời gian, nhưng **không bỏ ngày 5**: không có phỏng vấn
ngắn thì không phân biệt được "không biết tính năng" với "tính năng lỗi".

## 5. Biểu mẫu

### 5.1. Phản hồi cuối ngày (2 phút)

Thang 1–5 (1 = rất khó, 5 = rất dễ) + ô mở:

1. Đăng nhập và vào server: điểm ___; chỗ nào khó?
2. Gửi tin và thấy tin của người khác hiện ra: điểm ___; có lúc nào không chắc tin đã gửi?
3. Tìm lại một tin cũ: điểm ___; bạn tìm bằng cách nào?
4. Biết mình có tin chưa đọc/được nhắc: điểm ___; có bỏ sót thông báo không?
5. Hỏi AI và kiểm chứng câu trả lời bằng trích dẫn: điểm ___; bạn có tin câu trả lời không, vì sao?
6. Tải tệp/ảnh và mở lại: điểm ___; trạng thái kiểm tra tệp có rõ không?
7. Điều khó chịu nhất hôm nay (1 câu):
8. Nếu chỉ được sửa một thứ, bạn sửa gì?

### 5.2. Mẫu báo lỗi

```text
Mã: PILOT-<số>
Người báo / ngày giờ (UTC+7):
Mức: P0 chặn | P1 nặng | P2 nhỏ
Luồng: đăng nhập | join | chat | tệp | unread | search | DM | AI | reconnect | khác
Môi trường: LAN (trình duyệt/OS) hoặc staging
Bước tái hiện: 1) … 2) … 3) …
Kỳ vọng:
Thực tế:
Mã lỗi hiện trên UI (requestId):
Ảnh/video (không chứa dữ liệu thật):
Tần suất: luôn | thỉnh thoảng | một lần
```

Mức:

- **P0 chặn**: không đăng nhập/join/gửi tin được, mất tin, lộ dữ liệu người khác, AI trả lời bằng dữ liệu ngoài quyền → dừng pilot, sửa trước khi tiếp.
- **P1 nặng**: một luồng chính hỏng nhưng có đường vòng; sai thứ tự/trùng tin khi reconnect; tệp kẹt "Đang kiểm tra".
- **P2 nhỏ**: nhãn khó hiểu, lệch giao diện, thiếu phím tắt.

Điều phối đối chiếu `requestId` với log API (runbook [trace-by-request-id.md](../../runbook/trace-by-request-id.md));
không dán nội dung tin nhắn hay token vào báo cáo.

## 6. Bảng kết quả

Điền sau khi chạy; giữ ảnh/biên bản trong `docs/v0.2.0/evidence/T7.1/`.

| Người (vai trò) | Ngày | Luồng hoàn thành (1–9) | Tới tin đầu (giây) | Điểm khó nhất | P0/P1 đã báo |
| --------------- | ---- | ---------------------- | ------------------ | ------------- | ------------ |
|                 |      |                        |                    |               |              |

| Mã bug | Mức | Luồng | Trạng thái (mở/đã sửa/chấp nhận) | Commit sửa | Ghi chú |
| ------ | --- | ----- | -------------------------------- | ---------- | ------- |
|        |     |       |                                  |            |         |

Tổng hợp bắt buộc:

- Tỷ lệ hoàn thành từng luồng (số người / tổng) và chỗ dừng đầu tiên.
- 3 vấn đề được nhắc nhiều nhất, kèm trích dẫn nguyên văn (đã ẩn tên).
- Danh sách P0/P1 và quyết định: sửa trong lô nào, hay OWNER chấp nhận rủi ro (ghi lý do).
- Điều **chưa** kết luận được vì pilot LAN (ví dụ: thư thật, TLS công khai, nhiều mạng khác nhau).

## 7. Tiêu chí kết thúc pilot

- Không còn P0 mở.
- Mọi P1 hoặc đã sửa có commit + test, hoặc OWNER chấp nhận rủi ro bằng văn bản trong biên bản.
- Ít nhất 4/5 người (hoặc 8/10) hoàn thành luồng 1–4 mà không cần điều phối làm hộ.
- Có biên bản tổng hợp + bảng kết quả + ảnh, liên kết từ mục H2 của [cổng nghiệm thu](v0.2.0.md).
- Đóng môi trường: `dropdb ping_pilot`, xóa tệp tải lên trong storage pilot, thu hồi mã mời.

Chỉ khi đó T7.1 mới chuyển `blocked` → `done`; **không** tự suy ra "pilot đạt" từ e2e tự động.
