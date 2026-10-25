# Evidence `T4.5` — `Test hỗn loạn nhẹ cho gap recovery: rớt gói, đảo thứ tự, nonce trùng`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên cùng ngày (kèm 2 điểm sửa).
- Task, nhánh: T4.5 — `feat/t4.5-chaos-gap` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `1acf5bc` (main sau T4.4).
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant), Playwright 1.63.

## Hai lỗi thật bị phân tích hỗn loạn bóc ra (sửa trước, test đỏ trước)

1. **Đảo thứ tự create:** `upsertMessage` prepend vô điều kiện vào đầu trang 0 — nếu event
   `m5` đến trước `m4` (hai instance API phát gần đồng thời qua Redis pub/sub), hiển thị sai
   thứ tự vĩnh viễn. Sửa: `insertSorted` — chèn vào đúng vị trí theo id trong trang chứa
   khoảng id của tin (cũ hơn mọi trang thì xuống cuối trang cuối). Test đỏ trước khi sửa.
2. **Rớt gói giữa chừng:** event `m3` mất nhưng `m4, m5` vẫn đến → tail cache = `m5`, vòng
   `?after=` không bao giờ thấy lại `m3`. Sửa: `useChannelSync` sau vòng vá lấy thêm **trang
   mới nhất (50)**, gộp với kết quả vòng vá theo id rồi `patchGap` một lần — upsert vá lỗ hổng
   trong phạm vi 50 tin cuối; prune vẫn an toàn vì tập gộp ⊇ toàn bộ khoảng (tail, newest].
   `patchGap` thêm cờ `prune` (mặc định true) cho ngữ cảnh merge trang riêng lẻ (không đại
   diện toàn khoảng → không được dùng để kết luận xóa).

## Thay đổi

- `apps/web/src/features/messages/message-cache.ts`: `insertSorted` (private) + `patchGap`
  tùy chọn `prune`.
- `apps/web/src/features/messages/hooks.ts` (`useChannelSync`): gộp vòng `?after=` với trang
  mới nhất.
- Không đổi API/DB.

## Kiểm chứng

| Kịch bản hỗn loạn                                        | Cách thử                                                                                                                                                                                                                                                                                                               | Kết quả                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Đảo thứ tự create (m5 trước m4)                          | unit `message-cache.test.ts`: upsert m5 rồi m4 → trang 0 `[m5, m4, m3, m2]`                                                                                                                                                                                                                                            | pass (đỏ trước khi sửa) |
| Rớt gói giữa chừng + vá bằng merge trang mới nhất        | unit: cache có m1,m2,m4,m5 → `patchGap(prune:false)` với trang mới nhất đủ → đủ m3, không trùng                                                                                                                                                                                                                        | pass                    |
| prune mặc định vẫn dọn tin đã xóa; prune=false không dọn | unit đối chiếu hai cờ                                                                                                                                                                                                                                                                                                  | pass                    |
| Nonce trùng: optimistic + patch cùng nonce               | unit: đúng MỘT bản, hết status tạm, id thật                                                                                                                                                                                                                                                                            | pass                    |
| Nonce trùng đồng thời phía server                        | API e2e: hai POST song song cùng nonce → cùng id, DB 1 hàng (xóa mềm sau test để không lệch đếm)                                                                                                                                                                                                                       | pass                    |
| **Rớt gói + đảo thứ tự thật trên WebSocket**             | web e2e `chaos-gap.spec.ts`: `page.routeWebSocket` chặn frame server→page — rớt 1 frame `message.created`, giữ 1 frame thả sau tin kế tiếp → hiển thị không trùng, thứ tự đứng đúng theo vị trí y (m1 < m3-hold < m4 dù m3 đến sau); reconnect → tin bị rớt hiện lại đúng một lần qua merge trang-mới-nhất, banner tắt | **pass (56,9 s)**       |
| Hồi quy                                                  | `pnpm test` (unit 149 web… xem dưới), API e2e, web e2e, lint/format/build/bundle/docs                                                                                                                                                                                                                                  | xem bảng dưới           |

| Bộ                                                             | Kết quả                      |
| -------------------------------------------------------------- | ---------------------------- |
| Web unit (`pnpm --filter web test`)                            | **149 pass** (145 + 4 chaos) |
| API e2e (`pnpm --filter api test:e2e`)                         | **183/183 pass**             |
| Web e2e (`pnpm --filter web exec playwright test --workers=1`) | xem status                   |
| Lint / typecheck / format / build / bundle / docs              | pass — bundle 243,9 KB       |

Chạy lại: `pnpm --filter web exec vitest run src/features/messages/message-cache.test.ts`;
web chaos: `pnpm --filter web exec playwright test e2e/chaos-gap.spec.ts`.

## Phát hiện khi làm

- Phân tích hỗn loạn TÍCH CỰC tìm ra 2 lỗi thật (đảo thứ tự, rớt gói giữa chừng) trước khi
  viết test — test viết để đỏ đúng lý do trên hiện trạng cũ, sau đó xanh sau khi sửa.
- Playwright `routeWebSocket`: `server.onMessage` (server→page) tắt chuyển tiếp tự động —
  phải chuyển tiếp thủ công cả hai chiều; chỉ đụng frame có token của test, ping/pong và
  event khác đi nguyên dạng.
- e2e API: biến `prisma` trong spec chỉ tồn tại trong `afterAll` — lấy handle riêng bằng
  `app.get(PrismaService)`.

## Giới hạn và tiếp theo

- Lỗ hổng rớt gói chỉ được vá trong phạm vi **50 tin mới nhất** (một trang); mất gói sâu hơn
  phải chờ refetch nền — ghi trong cs-02, cân nhắc đo ở T6.1.
- Chưa thử: frame `message.updated`/`deleted` rớt/đảo (semantic khác — tin vẫn hiện nội dung
  cũ tới lần sync sau); để T4.6+/T6.3 nếu cần.
- cs-02 đã bổ sung mục hỗn loạn; số tải còn thiếu chờ T6.1/T7.2.
