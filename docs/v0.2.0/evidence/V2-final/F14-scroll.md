# F14 — cuộn 10.000 tin và long task (2026-11-14)

Đo trên bản production local (`next build` + `next start`) với API `:4000` trỏ `ping_demo`; kênh
`pha-che` của server `Ping Coffee` có **12.000 tin**. Máy đo: Windows, Chromium
153.0.8010.12, viewport 1280×800, không giới hạn CPU. Kết quả: **không đạt** tiêu chí
"không long task > 50 ms" của F14.

## 1. Cách đo

```bash
pnpm --filter web exec node scripts/measure-scroll.mjs
```

Script ([apps/web/scripts/measure-scroll.mjs](../../../../apps/web/scripts/measure-scroll.mjs))
đăng nhập bằng API, mở kênh, rồi lặp 200 vòng: đặt `scrollTop = 0`, chờ phản hồi
`GET /messages?before=`, nghỉ 120 ms. `PerformanceObserver` ghi mọi `longtask` từ lúc mở trang.
Mỗi trang mặc định 50 tin (`apps/api/src/modules/messages/schemas.ts:8`) nên 200 vòng tải
**10.000 tin**. Kênh còn 2.000 tin cũ hơn; vòng lặp dừng vì chạm 200 vòng, không phải vì hết dữ
liệu.

## 2. Kết quả (2026-11-14 06:20Z)

| Số đo                    | Giá trị           |
| ------------------------ | ----------------- |
| Trang tải được           | 200/200           |
| Tin đã tải               | 10.000 (200 × 50) |
| Thời gian 200 vòng       | 121.395 ms        |
| Số long task             | 14                |
| Long task **> 50 ms**    | **13**            |
| Long task dài nhất (p95) | **137 ms**        |
| Tổng thời gian long task | 1.045 ms          |

Criterion F14 là "không long task > 50 ms". Có 13 long task vượt ngưỡng, nên **không đạt**.
Mức ảnh hưởng là giật cục bộ khi các lô tin cũ mount; danh sách vẫn tải đủ và giữ được vị trí
(xem mục 4).

## 3. Hàm tốn nhất

Chạy lại 30 vòng với CDP `Profiler` (lấy mẫu 1 ms; có overhead nên **không** dùng số long task
của lần này để đối chiếu ngưỡng):

| Hạng | Self-time (30 vòng) | Nguồn                                                     |
| ---- | ------------------- | --------------------------------------------------------- |
| 1    | 242 ms              | getter `offsetWidth` (đọc layout đồng bộ, buộc reflow)    |
| 2    | 167 ms              | hàm ẩn danh trong chunk chat có `@tanstack/react-virtual` |
| 3    | 118 ms              | garbage collector                                         |
| 4    | 116 ms              | hàm `ts` cùng chunk (mã virtualizer)                      |

Getter native bị V8 cắt frame cha, nên chèn getter để lấy stack thật trong 10 vòng (1.218 lần
đọc `offsetWidth`/`offsetHeight`):

| Lần đọc | Call site                                                                      |
| ------- | ------------------------------------------------------------------------------ |
| 750     | `PingAvatar` → antd `Avatar`: `setScaleParam` đọc 2 lần/avatar khi mount       |
| 386     | `rc-resize-observer` đo `getBoundingClientRect` + `offsetWidth`/`offsetHeight` |
| 82      | `measureElement` của `@tanstack/react-virtual`                                 |

Nguồn tốn nhất không phải virtualizer mà là **antd `Avatar`**: `PingAvatar`
(`apps/web/src/components/ui/ping-avatar.tsx:29`) dùng `Avatar` cho từng tin, và `Avatar` đọc
`offsetWidth` của node + children trong `useEffect` mỗi lần mount (kể cả avatar ảnh, không cần
co giãn chữ). Mỗi lô tin cũ mount hàng chục avatar → chuỗi reflow đồng bộ, cộng thêm
`rc-resize-observer` và `measureElement`, tạo long task 50–137 ms.

Hướng sửa và mục nợ kỹ thuật: xem [tech-debt.md](../../../tech-debt.md) P2 "Long task khi cuộn
10.000 tin". Chưa sửa trong v0.2.0; khi sửa phải chạy lại đúng script này và ghi số mới.

## 4. Phần "giữ vị trí khi tải tin cũ"

Không đo lại trong lần chạy này; đã có bằng chứng e2e trước đó: cuộn lên tải 300 tin theo trang,
tin `#300` biến mất/rồi quay lại khi cuộn về đáy, và spec `messages.spec` phủ "cuộn lên tải dần
tin cũ tới đầu channel" ([T6.8](../T6.8/README.md)). Phần này đạt; phần long task không đạt.

## 5. Giới hạn của số đo

- Lab một máy, Chromium headless, không throttle CPU, chạy **một lần**; chưa phải RUM hay máy
  người dùng thật.
- Chưa tới 2.000 tin cũ nhất do dừng ở 200 vòng; xu hướng long task khi mount trang tin không
  phụ thuộc độ sâu, nhưng chưa chạm mép trên danh sách.
- Tên chunk băm theo build; nhận diện theo module (`PingAvatar`/antd Avatar,
  `@tanstack/react-virtual`), không theo tên tệp.
