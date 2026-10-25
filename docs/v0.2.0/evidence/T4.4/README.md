# Evidence `T4.4` — `ADR-0044 + GET messages?after=; vá khoảng trống khi reconnect`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên cùng ngày.
- Task, nhánh: T4.4 — `feat/t4.4-gap-recovery` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `f7facbe` (main sau T4.3).
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant).

## Thay đổi

- **ADR-0044** (`docs/adr/0044-gap-recovery.md`, accepted theo duyệt kế hoạch): hồi phục bằng
  vá khoảng trống `?after=` thay vì refetch toàn bộ; tail cache là cursor (không state riêng);
  dọn tin đã xóa trong khoảng đã fetch; fallback refetch khi không vá được.
- **API:** `listMessagesQuerySchema` thêm `after: uuid` (refine loại trừ với `before`);
  `MessagesService.list` nhánh `after`: `id > after`, **ORDER BY id ASC**, `take limit+1`,
  `hasMore` = còn tin mới hơn; bỏ tin xóa mềm. Không route/migration mới.
- **Web:** `listMessagesAfter` (api client); hàm thuần `patchGap` trong `message-cache.ts` —
  upsert từng tin khớp id/nonce (không trùng), bỏ cached id trong `(afterId, maxFetchedId]`
  vắng mặt ở server (đã xóa lúc offline), KHÔNG bỏ tin optimistic (`temp-*`/sending/failed) và
  tin ngoài khoảng fetch (event socket song song); `useChannelSync` đổi sang: tail cache →
  vòng lặp `?after=` tới hết hasMore → `patchGap`; cache trống / tail là tin temp / lỗi →
  fallback `invalidateQueries` như trước.

## Kiểm chứng

| Tiêu chí đạt                                                      | Lệnh/cách thử                                                                                                                                                                                                                                                                                                                                                                        | Kết quả                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `?after=` đúng hợp đồng                                           | API e2e `messages.e2e-spec.ts` (test mới cuối file): tăng dần, hasMore, phân trang tiếp theo, bỏ tin đã xóa mềm, `before`+`after` → 400                                                                                                                                                                                                                                              | pass                                           |
| Vá không trùng/không sót                                          | unit `patchGap` 4 test (chèn đúng chỗ; bỏ tin đã xóa trong khoảng; giữ tin ngoài khoảng + optimistic; fetch rỗng)                                                                                                                                                                                                                                                                    | pass — web unit **145**                        |
| **Ngắt mạng, 100 tin từ client khác, nối lại → đủ & đúng thứ tự** | web e2e `gap-recovery.spec.ts`: offline thật (emulation + đóng bridge WS), 2 tin gieu trước khi offline (cache có tail), 100 tin từ 3 tài khoản seed nhịp 400 ms (dưới 2 lớp rate limit), xóa 1 tin lúc offline, reconnect → 99 tin còn lại hiện đủ/đúng thứ tự (kiểm mẫu 0/10/30/70/98 bằng cuộn qua danh sách ảo hóa), không trùng, tin đã xóa biến mất, banner mất kết nối tự tắt | **pass** (2,4 phút)                            |
| Hồi quy API                                                       | `pnpm --filter api test:e2e`                                                                                                                                                                                                                                                                                                                                                         | **183/183 pass**                               |
| Hồi quy web e2e                                                   | `pnpm --filter web exec playwright test --workers=1`                                                                                                                                                                                                                                                                                                                                 | **29 pass, 1 skip** (28 cũ + gap-recovery mới) |
| Bộ chuẩn                                                          | `pnpm test` (unit), lint, format, build, bundle, docs:check                                                                                                                                                                                                                                                                                                                          | pass — bundle 243,9 KB                         |

Chạy lại: Docker đang chạy; API: `pnpm --filter api exec vitest run --config
./vitest.config.e2e.ts test/messages.e2e-spec.ts`; web: `pnpm --filter web exec playwright test
e2e/gap-recovery.spec.ts`.

## Phát hiện khi làm

- Kênh chưa từng mở không có tail → đi nhánh fallback refetch (đúng thiết kế: mở kênh là query
  đầy đủ); e2e phải gieo 2 tin lúc còn online để test đi đúng đường vá — cũng là điều kiện thực
  của người dùng đang xem kênh.
- Test `?after=` đặt giữa file làm vỡ đếm của các test sau (state dùng chung theo thứ tự) —
  chuyển xuống cuối file.
- Docker Desktop tắt giữa phiên (pipe biến mất) — khởi động lại bằng Start-Process + chờ engine.
- Lint bắt import không dùng sau khi refactor context — bỏ.

## Giới hạn và tiếp theo

- Hiệu chỉnh xóa chỉ trong khoảng `(afterId, maxFetchedId]`; tin cũ hơn bị xóa lúc offline chờ
  refetch nền — đánh đổi để không đua với event socket.
- Chưa đo p95 thời gian vá theo độ dài khoảng trống; chưa thử đảo thứ tự/nonce trùng — thuộc
  T4.5 (test hỗn loạn nhẹ) và T6.1 (tải).
- Case study 2 draft: [cs-02-outbox-gap-recovery.md](../../case-studies/cs-02-outbox-gap-recovery.md)
  — hoàn thiện số liệu còn thiếu ở T4.5/T7.2.
