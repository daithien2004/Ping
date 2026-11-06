# Việc còn lại sau ADR-0077…0080 và hướng xử lý cuộn tin nhắn

Tài liệu làm việc cho người triển khai. Bối cảnh và nguồn của từng thực hành nằm ở
[Thực hành của Discord](../discord-practices.md); đây chỉ là danh sách việc, thứ tự làm và cách kiểm
chứng. Số đo ghi ở đây lấy ngày 2026-11-06 trên bản dev, tài khoản 69 server, kênh khoảng 100 tin.

## Đã xong (đã đo hoặc đã đọc code)

- Unread gộp một request: 1 request `/users/me/unread`, 0 lỗi 429, tổng 22 request API khi tải
  trang (trước đây 92).
- Link tệp đính kèm sống 24 giờ, GET gặp 429 thì chờ `Retry-After` rồi thử lại một lần.
- `PUT /read` chỉ gửi một lần cho mỗi tin cuối; lỗi mạng thì tự gửi lại đúng một lần (`f97dd52`).
- Rate limit theo bucket và khoá theo người dùng (ADR-0080); `/attachments/:id/download` khoá theo
  người dùng, chỉ `/file` khoá theo IP (`529b924`).
- Kênh 30 ảnh, cuộn từ dưới lên: 30 request `/attachments/:id/file` + 30 `/download`, tất cả 200,
  0 lỗi 429 (đo 2026-11-06, khớp kỳ vọng của A4).
- Cuộn tin nhắn: hàng `memo` + prop ổn định + `overscan` 4. Bản production, kênh 300 tin, 218 frame:
  p50 16,6 ms, p95 29–31 ms, 0 frame > 50 ms, 0 long task (`c64a65e`). Kênh này 300 tin, khác điều
  kiện mốc gốc (~100 tin), nên chỉ so sau khi đo lại cùng kênh.
- Sau khi tách `sendMutate` khỏi object `sendMutation` trong deps, đo lại trên trang đang chạy:
  `onRetry` đổi identity 0/9 hàng qua một tick cuộn 30 px (trước 9/9).

## Phần A. Việc nhỏ còn lại

Cả bốn việc A1–A4 đã xong ngày 2026-11-06; giữ mô tả dưới đây để tra cứu cách làm và cách kiểm chứng.
Làm theo thứ tự này, mỗi việc một commit nhỏ.

1. **A1 — Dọn ảnh evidence bị đổi ngoài ý muốn (đã xong).** Chín file PNG dưới `docs/v0.2.0/evidence/` đang ở trạng
   thái modified, nhiều khả năng do chạy e2e chụp lại ảnh. Nếu không cố ý cập nhật bằng chứng thì
   `git restore docs/v0.2.0/evidence`. Đừng commit lẫn vào commit khác.
2. **A2 — Mark-read thử lại khi lỗi mạng (đã xong).** Trong `message-pane.tsx`, `lastMarked` được gán trước khi
   gửi, nên `PUT /read` lỗi sẽ không được thử lại cho tới khi có tin mới hoặc remount. Cách xử lý:
   trong `onError` của mutation (hoặc `.catch`), đặt lại `lastMarked.current = null` để lần render
   sau gửi lại. Thêm một test nhỏ: lỗi một lần rồi thành công thì cuối cùng vẫn có đúng một lần gửi
   thành công.
3. **A3 — Khoá `/attachments/:id/download` theo người dùng (đã xong).** Route này có header Authorization nên
   không cần `@RateLimitByIp()`; chỉ `/attachments/:id/file` (link ký, không có header) cần khoá
   theo IP. Bỏ decorator ở `download` để người dùng chung IP không giành hạn mức 600 request mỗi
   phút. Cập nhật ADR-0080 một dòng và bài e2e bucket nếu có chỗ nhắc.
4. **A4 — Đo kênh nhiều ảnh với bucket mới (đã xong).** Mở một kênh có từ 30 ảnh trở lên, cuộn từ dưới lên trên,
   rồi đếm trạng thái 429 ở `/attachments/:id/file` và `/download`. Kỳ vọng: 0 lỗi 429. Nếu có,
   tăng `attachmentRead` hoặc giảm số request link (link tin nhắn đã sống 24 giờ nên không cần
   xin lại).

## Phần B. Cuộn tin nhắn không mượt

### Số đo gốc (bản dev)

Cuộn lên rồi xuống 110 frame mỗi chiều, mỗi frame 45 px:

- Frame time p50 40 ms, p95 235 ms, p99 273 ms, lớn nhất 344 ms.
- 108 trên 218 frame chậm hơn 50 ms, hơn 120 long task (100–230 ms mỗi cái).
- Layout shift tổng 0,006, gần như không có.
- Gần như toàn bộ thời gian nằm trong handler `onscroll`, mỗi lần khoảng 165 ms, và là pha render
  của React. Layout và style của trình duyệt chỉ khoảng 1 ms.

Kết luận: nút thắt là chi phí render mỗi lần cuộn, không phải việc đo lại chiều cao hàng. Ảnh đổi
chiều cao và `estimateSize` cố định 56 chỉ xử lý sau khi bước 1–3 xong.

**Đã làm ngày 2026-11-06:** bước 0 (đo gốc), bước 1 và phần `overscan` của bước 4 (`c64a65e`);
p95 đã trong mục tiêu nên dừng theo đúng điều kiện của bước 1. Số đo sau cùng ở bản production,
kênh 300 tin: p50 16,6 ms, p95 29–31 ms, 0 frame > 50 ms, 0 long task. Bước 2, 3 và phần còn lại
của bước 4 để dành khi số đo tăng lại. Bước 5: giữ nguyên `followOnAppend`; e2e neo cuộn,
`gap-recovery` và `realtime` xanh.

### Nguyên nhân đang nghi (cần xác nhận bằng đo)

- `MessageItem` chưa `React.memo`.
- `retry`, `jumpTo`, `permalinkOf` trong `MessagePane` là hàm mới ở mỗi lần render. `MessagePane`
  không được React Compiler tối ưu (comment `incompatible-library` ở chỗ gọi `useVirtualizer`), nên
  các prop hàm đổi identity liên tục và làm hỏng memo của `MessageItem` dù compiler có bật.
- Mỗi tick cuộn làm cả pane render lại để cập nhật vùng nhìn, kéo theo khoảng 13 hàng.

Discord công bố cùng nguyên tắc: giữ prop ổn định, đẩy subscribe xuống component con, hoist regex
của bộ parse markdown (giảm khoảng 30% chi phí parse). Cuộn trên web của Discord không có tài liệu
công khai, nên đây không phải bản sao cách làm của họ.

### Thứ tự làm

Sau mỗi bước chạy lại bài đo ở mục "Cách đo" và ghi p50, p95, số long task vào commit.

**Bước 0. Chốt số đo gốc.** Chạy bài đo trên bản dev (đã có ở trên) và trên bản production
(`next build` rồi `next start` ở cổng khác; không build đè thư mục `.next` của server dev đang
chạy). Mục tiêu cuối: p95 từ 33 ms trở xuống, dưới 5 long task, ở bản production.

**Bước 1. Giữ prop ổn định và memo hàng** (`message-pane.tsx`, `message-item.tsx`) — **đã xong**
(`c64a65e`, sau đó tách `sendMutate` khỏi object mutation để `onRetry` ổn định).

- Bọc `retry`, `jumpTo` bằng `useCallback`. Giá trị phụ thuộc của chúng phải ổn định, dùng ref cho
  thứ gì thay đổi liên tục thay vì đưa vào danh sách phụ thuộc.
- Thay `permalinkOf(message.id)` trong vòng `map` bằng chuỗi được tính một lần, hoặc để
  `MessageItem` tự dựng permalink từ `serverId`, `channelId` và `message.id`.
- Bọc `MessageItem` bằng `React.memo`. Kiểm tra từng prop truyền vào: không có object, mảng hay style
  inline mới. `onAction={setSelection}` thì ổn vì setter của `useState` ổn định.
- Đo lại. Đây là bước có hiệu quả lớn nhất; nếu p95 đã trong mức mục tiêu thì dừng ở đây.

**Bước 2. Không để mỗi tick cuộn kéo cả pane render.**

- `firstVisible` đang được tính ở cấp pane. Tách việc "gần đỉnh thì tải tin cũ" ra, dùng một phần
  tử sentinel ở đầu danh sách với `IntersectionObserver`, hoặc `onChange` của virtualizer, và chỉ
  `setState` khi thật sự cần tải trang.
- Đổi ngưỡng tải: hiện là `firstVisible <= 2`, tức gần chạm đỉnh mới bắt đầu tải nên cuộn nhanh sẽ
  đứng chờ. Kích hoạt khi còn khoảng 1–2 màn hình tới đỉnh (`rootMargin` khoảng `200%` của sentinel)
  hoặc dùng `firstVisible <= 15`.
- Giữ nguyên cơ chế `loadOlderEnabled` để không tải trang cũ ngay lần render đầu.

**Bước 3. Giảm chi phí mỗi hàng** (`MessageItem` và các component con).

- Đưa regex của bộ parse markdown ra ngoài hàm; memo kết quả parse theo `content`.
- Hook nặng chỉ chạy ở component cần: `useAttachmentLink` và `useInView` nằm trong component ảnh,
  không ở cấp hàng.
- Phần hiếm dùng (reaction picker, menu hành động, preview embed) chỉ mount khi hover hoặc khi có
  dữ liệu.
- Nếu hàng dùng `useQuery` hay store: dùng selector hẹp để chỉ hàng liên quan render khi dữ liệu
  đổi.

**Bước 4. Tinh chỉnh virtualizer** (chỉ làm nếu sau bước 1–3 vẫn chưa đạt).

- Giảm `overscan` từ 8 xuống 3–4.
- `estimateSize` theo loại tin (có ảnh, có reply, tin ghép). Hàng thật đo được 56, 81, 109, 218 px
  trong khi ước lượng luôn 56.
- Ảnh: dành chỗ bằng `aspect-ratio` dựa trên `width` và `height` của attachment nếu API trả về.
  Hiện chiều cao thẻ do phần tên tệp giữ (ADR-0079), nên thumbnail tải xong sẽ làm hàng cao lên.
  Đây là thực hành chung tốt, không phải điều Discord đã công bố.
- CSS: thử `contain: layout paint` trên hàng; tránh `backdrop-filter` và shadow lớn trong hàng.

**Bước 5. Tin mới khi đang đọc tin cũ.** `followOnAppend` đã bật. Kiểm tra bằng tay: đang cuộn lên
đọc tin cũ, có tin mới đến thì vị trí không bị kéo. Nếu có, hiện thanh "Về tin mới nhất" thay vì tự
cuộn.

### Cách đo

Mở kênh nhiều tin, vào Console của trình duyệt và chạy (cuộn lên rồi xuống, in ra phân vị frame
time và số long task):

```js
const row = document.querySelector('[data-index]');
let el = row;
while (
  el &&
  !(el.scrollHeight > el.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(el).overflowY))
)
  el = el.parentElement;
const longTasks = [];
const po = new PerformanceObserver((l) =>
  l.getEntries().forEach((e) => longTasks.push(e.duration)),
);
po.observe({ type: 'longtask' });
async function run(dir, step, frames) {
  const d = [];
  let last = performance.now();
  for (let i = 0; i < frames; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const n = performance.now();
    d.push(n - last);
    last = n;
    el.scrollTop += dir * step;
  }
  return d;
}
const all = [...(await run(-1, 45, 110)), ...(await run(1, 45, 110))]
  .slice(2)
  .sort((a, b) => a - b);
const q = (p) => Math.round(all[Math.floor(all.length * p)] * 10) / 10;
po.disconnect();
({
  p50: q(0.5),
  p95: q(0.95),
  p99: q(0.99),
  over50: all.filter((x) => x > 50).length,
  longTasks: longTasks.length,
});
```

Đo ba lần, lấy lần giữa. Đo cùng một kênh, cùng độ cao cửa sổ, và đóng DevTools Performance khi không
cần vì nó làm số chậm đi.

### Kiểm chứng trước khi commit

- `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- E2E tin nhắn trong `apps/web/e2e`, đặc biệt các bài về neo cuộn, `followOnAppend` và `?around=`;
  đây là chỗ dễ vỡ nhất khi đổi cách tải tin cũ.
- Đổi ngưỡng tải tin cũ hoặc cách tính vùng nhìn thì ghi một ADR ngắn (quy tắc 15).

## Phần C. Việc 5 trở đi của lộ trình

Đã xong ngày 2026-11-06: SQL unread dừng quét ở 100 hàng (`a00353d`; `EXPLAIN ANALYZE` trên kênh
10k tin: 3,48 ms / 1012 buffer → 0,13 ms / 15 buffer); `maxHttpBufferSize` hạ về 4 KB và trần chờ
nối lại nâng lên 10 s (`08f4bff`; jitter ±50% vốn là mặc định của Socket.IO, thay đổi thật chỉ là
trần chờ); `EXPLAIN ANALYZE` tìm kiếm (từ hiếm đi qua GIN trigram/tsvector
1,8–8,6 ms; từ phổ biến khớp gần cả kênh 10k tin 18,6 ms — không cần thêm index hay chặn nhánh
`ILIKE`). Còn lại: không invalidate từng server khi reconnect (bản đầy đủ cần ADR và số thứ tự sự
kiện để phát bù); quyết định phân cấp role và overwrite theo kênh (chỉ làm khi có nhu cầu kênh riêng
tư). Chi tiết nằm ở mục "Lộ trình sửa cho Ping" trong [Thực hành của Discord](../discord-practices.md).
