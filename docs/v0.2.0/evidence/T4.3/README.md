# Evidence `T4.3` — `UI unread: badge server/channel, vạch tin mới, badge mention, tab title`

- Ngày/giờ: 2026-10-25 (UTC+7).
- Người thực hiện: agent (ZCode); OWNER duyệt kế hoạch trong phiên cùng ngày (gồm giới hạn:
  nhảy sâu tới tin chưa đọc thuộc TG.5).
- Task, nhánh: T4.3 — `feat/t4.3-unread-ui` (PR nháp local); kế hoạch local
  `docs/ping-v0.2.0-plan.md` (không commit); base `ab8172c` (main sau T4.2).
- Môi trường: Windows, Docker Desktop 28.5.1 (Postgres + Redis + Qdrant).

## Thay đổi

### Shared + API

- `ChannelUnreadDto` thêm `lastReadMessageId` (nullable) — GET unread trả kèm cursor để khung
  chat vạch "Tin mới"; thêm trường tương thích ngược, không đổi endpoint nào khác.
- **Phát hiện kiến trúc khi làm:** `message.created` chỉ tới room `channel:<id>` (ranh giới
  quyền) nên client KHÔNG xem kênh đó không nhận được event — badge không thể tăng realtime.
  Giải pháp: event mới **`channel.activity`** `{channelId, serverId, messageId, authorId}`
  (chỉ metadata, không nội dung) phát tới room `server:<id>` khi có tin mới; gateway cho
  socket vào room `server:<id>` của mọi server mình thuộc ngay lúc kết nối (best-effort như
  presence; kick/rời server vẫn do `refreshAccess` dọn). Người không có quyền xem channel chỉ
  biết "kênh có hoạt động" — không nhận nội dung.
- `messages.service.create` phát `channel.activity` sau broadcast `message.created`.

### Web

- `features/unread/`: API client (`GET unread`, `PUT read`), query key `qk.unread(serverId)`
  (rail chạy cho mọi server), hooks `useUnread`, `useMarkRead`, `useUnreadTitle`
  (`(N) Ping` với N = tổng mention), `useUnreadEvents` (nghe `channel.activity` /
  `mention.created` / `read.updated`; **refetch unread mọi server khi socket reconnect** —
  đối soát tin đến lúc mất mạng). Logic biến đổi là hàm thuần `unread-cache.ts`
  (applyIncoming/applyRead/totals/firstUnreadId).
- Server rail: badge trên mỗi server (mention > 0 → badge đỏ số mention; ngược lại unread > 0
  → badge số xám), nhãn aria đầy đủ `{name}, {n} tin chưa đọc / {n} lượt nhắc bạn`; vùng
  aria-live ẩn đọc "Bạn đã được nhắc trong server X" khi có mention ngoài kênh đang xem.
- Channel sidebar: mục kênh có unread → chữ đậm + badge số; mention → badge đỏ; kênh đang xem
  luôn sạch.
- Khung chat: `PUT read` khi vào kênh và khi có tin mới ở kênh đang xem (bỏ qua tin optimistic
  `temp-*`; cursor server chỉ-tiến nên lặp vô hại); **vạch "Tin mới"** trên tin chưa đọc đầu
  tiên — cursor được chốt một lần mỗi phiên xem (mark-read của chính mình không kéo vạch;
  `<Activity>`/cacheComponents tái tạo effect khi vào lại kênh = phiên mới). Chưa đọc lần nào
  → không vạch.
- i18n: 11 khoá mới (servers/channels/messages) thêm vào cả `vi.json`/`en.json`.

## Kiểm chứng

| Tiêu chí đạt                                        | Lệnh/cách thử                                                                                                                                                                                                                                                       | Kết quả                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Logic cache unread                                  | `pnpm --filter web test` (unread-cache.test.ts 10 test: tăng/không tính tin mình/mention/trần/đọc hết/chưa đọc lần nào)                                                                                                                                             | pass — web unit **141**                     |
| Badge server + kênh, mention đỏ, title, vạch, 2 tab | web e2e `unread-ui.spec.ts` (mới): tin ở kênh không xem → badge server; mention → badge đỏ + `(1) Ping` + aria-live đọc; vào server thấy badge kênh; mở kênh sạch; đọc rồi có tin mới → vào lại thấy vạch "Tin mới"; tab B badge sạch theo `read.updated` của tab A | pass (22,1 s)                               |
| Hồi quy API (gateway join room server + event mới)  | `pnpm --filter api test:e2e`                                                                                                                                                                                                                                        | **182/182 pass**                            |
| Hồi quy web e2e                                     | `pnpm --filter web exec playwright test --workers=1`                                                                                                                                                                                                                | **28 pass, 1 skip** (27 cũ + unread-ui mới) |
| a11y                                                | badge có nhãn aria; mention ngoài kênh đọc qua aria-live (đã assert trong e2e); axe chạy trong bộ a11y.spec của e2e                                                                                                                                                 | pass (theo bộ e2e)                          |
| Bundle ≤ 450 KB                                     | `pnpm --filter web check:bundle`                                                                                                                                                                                                                                    | JS ban đầu **243.9 KB** (8 chunk)           |
| Bộ chuẩn                                            | `pnpm test/lint/format/docs:check`, typecheck api+web, build                                                                                                                                                                                                        | pass                                        |

Chạy lại: Docker đang chạy; `pnpm --filter web exec playwright test e2e/unread-ui.spec.ts`.

## Review, giới hạn và tiếp theo

- Phát hiện khi làm: (1) badge không tăng vì `message.created` chỉ tới room channel — thêm
  `channel.activity` như trên; (2) vạch cần cursor từ lần đọc trước — lần đọc đầu tiên của kênh
  không có vạch (đúng thiết kế Discord); (3) TanStack `subscribe()` trả hàm unsubscribe trực
  tiếp, không phải object; (4) **hồi quy tên tiếp cận** — gán `aria-label` theo trạng thái unread
  làm tên link đổi ("# general" → "general, 2 tin chưa đọc") và 15 spec e2e vỡ; sửa bằng tên
  ổn định "# tên" + badge con mang số (`mention-badge`/`unread-badge` testid). Bài học: tên tiếp
  cận là hợp đồng công khai, không đổi theo trạng thái động.
- Người không có `VIEW_CHANNEL` nhận `channel.activity` (metadata) — chấp nhận cho pilot, ghi
  lại để TG.18 (quyền theo channel) xử lý sau.
- "Nhảy sâu tới tin chưa đọc" (tin cũ hơn cửa sổ đã tải) thuộc TG.5 (`?around=`) — theo kế
  hoạch đã duyệt.
- Mark-read chạy cả khi tab nền đang mở kênh — chấp nhận cho pilot (ghi chú UX).
- T4.4 tiếp theo: gap recovery (`GET messages?after=`, giữ `lastSeenId`, vá cache khi
  reconnect, không trùng/không sót).
