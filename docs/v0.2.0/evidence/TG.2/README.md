# Evidence TG.2 — Message reactions

- Ngày: 2026-10-26 (Asia/Saigon).
- Người thực hiện: Codex; nhánh `feat/tg2-reactions`.
- Base: `a9ccdf8`; commit `5e65a32` trên nhánh, chưa merge/push, chưa có CI mới.
- Môi trường: Windows, Node 24.22.0, pnpm 10.26.0, Postgres 17, Redis 7, Chromium/Playwright
  1.63.0, Next.js 16.4.2 production build. API e2e dùng Redis DB 1 riêng với dev.
- Thiết kế: [ADR-0064](../../../adr/0064-message-reactions.md), task TG.2 trong kế hoạch local.

## Phạm vi

Bảng `MessageReaction` với unique tin/người/emoji; permission `ADD_REACTIONS`; PUT/DELETE
idempotent; allowlist emoji; tối đa 20 loại/tin; rate limit 30 thao tác/10 giây/user/channel;
tổng hợp count/me theo lô; danh sách người thả dùng cursor id reaction, tải lười. Web dùng
picker tải lười, pill thả/gỡ, danh sách người thả, optimistic/rollback và event channel.

## Hồi quy tìm thấy và sửa

Đã chạy test đỏ trên implementation nhận bàn giao, rồi sửa cho xanh:

1. Hai request thêm loại emoji khác nhau lúc đã có 19 loại cùng trả 200, tạo 21 loại. Cả
   thêm/gỡ nay lấy advisory transaction lock theo message trong Postgres.
2. Chủ server sửa tin người khác nhận `me` theo tác giả. Controller truyền người gọi vào
   service để tổng hợp theo đúng người xem.
3. HTTP summary đến muộn ghi đè count realtime mới hơn. Nếu cache reaction đã đổi trong lúc
   chờ, giữ cache mới và invalidate để REST đối soát.
4. Mutation bị từ chối khi event đã đổi count không rollback an toàn được nhưng cũng không
   refetch. Nay invalidate trong trường hợp này.
5. Payload API cũ chưa có `reactions` làm cache/UI không chịu được rolling deploy. Fallback
   về mảng rỗng, có test đỏ trước rồi xanh.

Cleanup toàn bộ cũng tìm thấy FK reply thiếu index: truy vấn xóa fixture timeout sau 5 s tại
`ON DELETE SET NULL`. Migration expand mới + [ADR-0065](../../../adr/0065-message-reply-lookup-index.md)
giảm cùng truy vấn xuống 403 ms trên 467.578 tin (575 tin fixture, transaction luôn rollback).
Suite read-state chạy lại 8/8 pass. Không sửa migration cũ.

## Kiểm chứng hiện tại

| Kiểm tra                 | Kết quả                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration status         | 17 migration; deploy từ DB trống và nâng cấp DB local pass, cả hai diff không có khác biệt                                                                 |
| Format / docs            | `pnpm format:check` và `pnpm docs:check` pass lúc 11:41 ngày 2026-10-26                                                                                    |
| Lint                     | api và web pass (`eslint` từng package, chạy lại lúc 11:47); `@ping/shared` không có script lint                                                           |
| Typecheck                | shared / api / web pass; web chạy `next typegen && tsc --noEmit` lúc 11:49                                                                                 |
| Unit API                 | 194 pass / 25 file, 15,34 s (chạy tươi)                                                                                                                    |
| Unit shared/web/workflow | shared 34, web 193, workflow 27 pass; `pnpm test` exit 0, shared và web do turbo phát lại cache khớp hash mã nguồn hiện tại                                |
| Build production         | pass; cần quyền tải font Google Fonts ngoài sandbox                                                                                                        |
| Bundle ban đầu           | 245,0 KB gzip / 8 chunk, ngân sách 450 KB                                                                                                                  |
| API e2e toàn bộ          | **250/250 pass, 31 file**, 164,09 s; reaction, IDOR, quyền, Redis outage, multi-instance, API conventions (api-conventions chạy lại sau lần sửa spec cuối) |
| Web production / axe     | Reaction 1/1 pass (hai user/tab, reload, danh sách, rollback, axe sáng/tối); a11y 3/3 pass                                                                 |

Lượt unit toàn repo chạy song song với build/browser từng lỗi `VirtualAlloc failed` và
OpenSSL do thiếu tài nguyên; lượt web chạy lại với 2 worker đạt đầy đủ 193 test. Không đổi
ngưỡng test để che lỗi. Lượt web dev bị dừng vì font tải thất bại lặp lại; chuyển sang production.
Lượt API e2e đầu lỗi cleanup read-state đã được sửa bằng index; test presence từng sát timeout
vì sleep cố định 1,3 s, nay chờ đúng event online của tab thứ hai trước khi kiểm không có
offline. Không tăng timeout, không hạ assertion. Lượt cuối toàn bộ API đã xanh.

Shell của phiên này chạy ở mức tin cậy thấp (Low integrity): `vitest`/`node --test` bị `EPERM`
khi mở pipe tiến trình con, `next typegen` và turbo không ghi được `.next`/`.turbo`. Các lệnh
dưới đây vì thế chạy ngoài sandbox một lượt; không sửa mã nguồn, không đổi cấu hình test.

Ảnh đã kiểm trực quan: [sáng](screens/reactions-light.png), [tối](screens/reactions-dark.png).

## Chạy lại

```powershell
pnpm format:check
pnpm docs:check
pnpm lint
pnpm typecheck
pnpm test
# Nếu máy thiếu RAM, cùng bộ unit với package tuần tự / tối đa 2 worker:
node node_modules/turbo/bin/turbo run test --concurrency=1 -- --maxWorkers=2
pnpm build
pnpm --filter web check:bundle
pnpm --filter api test:e2e
$env:WEB_PORT='3110'
$env:E2E_PRODUCTION='1'
pnpm --filter web test:e2e
```

## Giới hạn và tiếp theo

- Trạng thái task: **done** — commit `5e65a32` trên `feat/tg2-reactions`, chưa merge/push theo
  pattern phiên; CI remote chạy sau khi tạo PR.
- Socket vẫn best-effort; REST là nguồn đối soát. Chưa có số thứ tự phiên bản cho reaction
  event; không tuyên bố giao tin bền hay chống mọi trường hợp đảo thứ tự liên instance.
- Không gọi LLM thật, không thêm dependency, không sửa migration đã merge.
- Rollback: quay lại code trước, giữ bảng mở rộng và bit permission mới trong DB; không drop
  bảng trong rollout rollback.
- Sau TG.2 là TG.3 (ghim tin); staging trả phí vẫn dời về cuối theo ADR-0059.
