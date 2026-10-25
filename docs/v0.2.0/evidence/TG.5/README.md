# Evidence `TG.5` — `Permalink tin nhắn + cửa sổ GET messages?around=`

- Ngày/giờ: 2026-10-26 (UTC+7).
- Người thực hiện: agent; thiết kế nằm trong kế hoạch Pha G (TG.5) OWNER đã duyệt.
- Task, nhánh: TG.5 — `feat/tg5-permalink` (PR nháp local); base `c67171b` (main sau TG.1).
- Commit code: `335697e`.
- Môi trường: Windows, Docker Desktop, Playwright 1.63, Postgres/Redis local, `next dev`
  (trừ khi ghi rõ `E2E_PRODUCTION=1`).

## Thay đổi

- **ADR-0062** (`docs/adr/0062-message-permalink.md`): permalink canonical
  `/servers/:serverId/channels/:channelId/messages/:messageId`, `?m=` giữ làm alias; API thêm
  chế độ đọc cửa sổ quanh tin; cache web giữ metadata `window`.
- **API** (`messages.service.ts`, `schemas.ts`):
  - `GET /channels/:channelId/messages?around=<id>&limit=N`; `around` loại trừ lẫn nhau với
    `before`/`after` (`400` "Provide at most one of before, after, around").
  - `listAround`: đọc tin đích (không tồn tại / khác channel / đã xóa mềm → `404`), rồi hai
    truy vấn keyset song song `id <= around` (desc) và `id > around` (asc), `take limit/2 + 1`
    mỗi phía; trả `messages` mới → cũ + `hasMore` (còn cũ hơn) + `hasNewer` (còn mới hơn).
- **Shared** (`schemas/message.ts`): `MessagePage.hasNewer?: boolean`, schema query có `around`.
- **Web**:
  - `messagePath()` dựng URL permalink; route mới
    `app/(app)/servers/[serverId]/channels/[channelId]/messages/[messageId]/page.tsx`.
  - `MessagePane` nhận `focusId` (route hoặc `?m=` cũ): nếu tin chưa có trong cache thì
    `useSeedAround` nạp **một** cửa sổ `?around=`; cuộn tới + tô sáng `data-highlighted`;
    đang nạp hiện `focus-loading`, tin không mở được (đã xóa/khác channel) hiện `focus-missing`.
  - Còn tin mới hơn (`window.hasNewer`) → nút "Tải tin mới hơn" (`data-testid="load-newer"`)
    gọi `?after=` từng trang, `prependNewer` chèn lên đầu; tin cũ hơn vẫn tải bằng
    `fetchNextPage` sẵn có.
  - `useChannelSync` khi cache là cửa sổ thì nạp lại **đúng cửa sổ** (`?around=`), không kéo
    lịch sử; `refetchOnWindowFocus`/`refetchOnReconnect` tắt trong chế độ cửa sổ.
  - Rời permalink (không còn `focusId`) → `resetQueries` về trang mới nhất.
  - Mark-read **bị chặn** khi `hasNewer` (chưa thấy hết channel).
  - Menu tin có "Sao chép liên kết" (`data-testid="copy-link"`), toast xác nhận; search dialog
    và khối trích dẫn reply điều hướng bằng permalink mới.
  - i18n vi/en: `copyLink`, `linkCopied`, `linkCopyFailed`, `loadNewer`, `loadingNewer`,
    `focusLoading`, `focusMissing`.
- **Test**: `apps/web/e2e/permalink.spec.ts` (mới), case `around` trong
  `apps/api/test/messages.e2e-spec.ts`, dòng IDOR `GET /channels/:channelId/messages?around=<tin
của A>` trong `idor.e2e-spec.ts`, unit `aroundWindow`/`prependNewer`/`preserveLocalMessages`
  trong `message-cache.test.ts`, `apps/api/prisma/seed-messages.ts` in `SEED_IDS` để e2e biết
  id đầu/giữa/cuối.

## Kiểm chứng

| Tiêu chí                                                      | Cách thử                                                                                             | Kết quả                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?around=` đúng cửa sổ, đúng cờ, `404` cho tin lạ             | API e2e `messages.e2e-spec.ts` + `idor.e2e-spec.ts`                                                  | **18/18 pass** (messages 12 + idor 6) — 50 tin quanh tin giữa, `hasMore`/`hasNewer` đúng, tin đầu channel `hasMore:false`, `limit=1` vẫn đúng `hasNewer`, tin đã xóa mềm `404`, `around` + `before` cùng lúc `400`, `around` tin của user A trên channel B `404` |
| Hồi quy API toàn bộ                                           | `pnpm --filter api test:e2e`                                                                         | **191/191 pass** (29 file), 139 s                                                                                                                                                                                                                                |
| Hồi quy shared                                                | `pnpm --filter @ping/shared test`                                                                    | **29/29 pass**                                                                                                                                                                                                                                                   |
| Hồi quy web unit                                              | `pnpm --filter web test`                                                                             | **183/183 pass** (23 file)                                                                                                                                                                                                                                       |
| Cửa sổ là O(limit), không O(lịch sử)                          | e2e: 5 mẫu `?around=` trên channel **10.000 tin** so với channel **200 tin** (cùng `limit=50`)       | trung vị **10k = 16–24 ms** vs **200 = 15–19 ms** qua 6 lần chạy; chênh trung vị ≤ 9 ms (ngưỡng đặt ra: chênh < 150 ms, tuyệt đối < 1.500 ms). Đo tuyệt đối không dùng làm bằng chứng vì indexer AI local cộng ~0,5–0,6 s/request (xem "Phát hiện")              |
| Mở permalink tin cũ: tô sáng đúng, không kéo tới tin mới nhất | e2e `permalink.spec.ts` (Playwright, app thật)                                                       | **pass** — `?around=` trong browser trả `hasNewer=true hasMore=true n=50`; tin cuối channel **không** có trong DOM; `data-highlighted=true`; URL giữ `/messages/<id>`                                                                                            |
| Thời gian tới highlight                                       | cùng e2e, đo từ `reload()` tới khi `data-highlighted`                                                | `next dev`: **2,57–3,63 s** (ngưỡng dev 6 s; ngưỡng thật `E2E_PRODUCTION=1` là **3 s**). Số dev chỉ để bắt hồi quy, không dùng làm bằng chứng hiệu năng — CI production build là cổng xác nhận                                                                   |
| Tải tin mới hơn từng trang                                    | e2e: bấm "Tải tin mới hơn" → `?after=` → nút **vẫn còn** (còn ~5.000 tin mới hơn)                    | pass; `prependNewer` đảo trang `after` (tăng dần) thành mới → cũ, chèn lên đầu, `window.hasNewer` cập nhật                                                                                                                                                       |
| Sao chép liên kết                                             | e2e: menu tin → "Sao chép liên kết" → đọc clipboard                                                  | pass — clipboard là URL permalink đúng, toast "Đã sao chép liên kết tin nhắn"                                                                                                                                                                                    |
| Nhảy từ reply tới tin chưa tải                                | e2e: reply vào tin giữa channel (ngoài cửa sổ đang tải) → bấm khối trích dẫn                         | pass — điều hướng permalink và tô sáng tin gốc                                                                                                                                                                                                                   |
| Alias `?m=` cũ                                                | e2e: mở `/channels/:id?m=<tin giữa>`                                                                 | pass — vẫn cuộn + tô sáng như trước TG.5                                                                                                                                                                                                                         |
| Tin không mở được                                             | e2e: permalink tin đã xóa mềm; permalink tin của channel khác                                        | pass — hiện `focus-missing`, không lộ nội dung tin của channel khác                                                                                                                                                                                              |
| Hồi quy e2e liên quan                                         | `e2e/search.spec.ts`, `e2e/reply.spec.ts`, `e2e/permissions.spec.ts` (chạy chung một lượt, 1 worker) | **3/3 pass** (41,7 s) — search điều hướng bằng permalink mới; reply/permissions không đổi                                                                                                                                                                        |
| Bundle ban đầu                                                | `pnpm --filter web build && pnpm --filter web check:bundle`                                          | **244,0 KB** gzip / 8 chunk (≤ 450 KB); lazy 652,5 KB / 45 chunk — **không đổi** so với TG.1                                                                                                                                                                     |
| Bộ chuẩn                                                      | typecheck api/web, lint web, `pnpm format`, `pnpm format:check`, `pnpm docs:check`                   | pass                                                                                                                                                                                                                                                             |

## Phát hiện khi làm

- **`infiniteQueryBehavior` dựng lại `{pages, pageParams}` từ đầu** khi `fetchNextPage`: metadata
  `window` (không thuộc `InfiniteData`) bị bỏ, nên nút "Tải tin mới hơn" biến mất ngay sau lần
  cuộn lên tải tin cũ. Sửa ở `preserveLocalMessages` (giữ `window` khi `after.window` là
  `undefined`), ghim bằng unit test đúng hình dạng dữ liệu TanStack trả về.
- **`setQueryData` không nhận option `structuralSharing`** (`SetDataOptions` chỉ có `updatedAt`)
  — nó dùng `structuralSharing` của query. Vì vậy mọi writer đều đi qua
  `preserveLocalMessages`; hàm này phải chịu được cả seed permalink lẫn `patchGap`.
- **Race `channel.join` với seed permalink**: `useChannelSync` đọc cache **trước** khi cửa sổ
  được seed, chờ mạng xong mới ghi `patchGap` "nối tới hiện tại" vào cache đã thành cửa sổ →
  trang 0 bị nhét thêm 50 tin mới nhất (100 tin), `pages[0].messages[0]` hoá thành tin mới nhất
  thật nên `?after=` trả rỗng và cờ `hasNewer` sai. Sửa: bỏ qua patch nếu cache đã có `window`.
  Đây là lỗi thật (không chỉ test flake), e2e tái hiện ổn định trước khi sửa.
- **Đo tuyệt đối không dùng được ở máy dev**: indexer AI local (`AI_INDEXER_ENABLED=true` +
  `QDRANT_URL`) cộng ~0,5–0,6 s cho **mọi** request đã đăng nhập (Redis `XREADGROUP ... BLOCK`
  dùng chung kết nối — sự cố đã ghi ở `docs/known-issues.md`); cùng một truy vấn đo được
  600 ms. Vì vậy tiêu chí hiệu năng của TG.5 là **so sánh tương đối** 10k vs 200 tin, và e2e
  chạy với `AI_INDEXER_ENABLED=false`.
- **Ngưỡng highlight phải theo chế độ**: `next dev` biên dịch route ở lần điều hướng đầu
  (2,5–3,6 s); production (CI) mới là nơi áp ngưỡng 3 s. Ngưỡng trong spec: 6 s khi dev, 3 s khi
  `E2E_PRODUCTION=1`.
- **`DELETE /servers|channels` với 10k tin trả `500`**: cascade vượt `PG_QUERY_TIMEOUT_MS`
  (5 s) → `Transaction API error ... timeout ... 5000 ms`. Không phải lỗi TG.5; dọn dẹp trong
  e2e chuyển sang best-effort (xóa từng kênh trước, cảnh báo nếu lỗi) và ghi ở
  `docs/tech-debt.md` (P2).

## Giới hạn và tiếp theo

- Mở permalink **không** tự theo tin mới; phải bấm "Tải tin mới hơn" (chủ ý — xem ADR-0062).
- Ở permalink cũ, mark-read trễ tới khi rời permalink hoặc tải hết tin mới hơn.
- `?m=` chỉ còn là alias; chưa có kế hoạch bỏ (liên kết ngoài hệ thống có thể còn).
- Số highlight của `next dev` không dùng làm bằng chứng; cần số `E2E_PRODUCTION=1` trên CI
  (job `web-e2e` chạy production build) để chốt ngưỡng 3 s.
- Xóa server/kênh lớn vẫn `500` (tech-debt P2) — ảnh hưởng dọn dẹp e2e local, không ảnh hưởng
  luồng permalink.
- Kế tiếp theo lịch: TG.2 (reaction — tái dùng emoji picker + permalink để nhảy tới tin được
  reaction).
