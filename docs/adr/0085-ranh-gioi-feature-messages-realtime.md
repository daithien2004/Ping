# ADR-0085: Ranh giới giữa messages, realtime, dms và servers

Status: accepted
Date: 2026-11-11

## Context

Feature `messages` được dùng làm mẫu cho cách tổ chức một feature (tách hàm thuần, hook một trách
nhiệm, component hiển thị, gốc ghép mỏng). Bên trong nó đã gọn, nhưng ranh giới với feature khác lỏng:

- "Kênh này là DM hay của server" có ba tín hiệu: `serverId === null` (pane, composer, hook nhảy tới
  tin, hook vạch tin mới), prop `dm?` và cờ `isDm` rải thêm; composer còn phải ép `serverId ?? ''`.
- `messages` tự biết route: `use-jump-to-message` import `dms/navigation` và `servers/navigation`.
- `realtime` (tầng truyền tải) import `messages`: `hooks.ts` gọi `useChannelSync`, và
  `realtime-provider.tsx` import hook sự kiện của 9 feature, tức đang làm gốc ghép của cả app.
- `messages` ép kiểu socket bằng `as unknown as` ngay trong `use-message-events`.
- Hai hook cuộn và gửi tin chia nhau một `ref` cờ `scrollOnAppend`.

ESLint chỉ cấm `components/` và `lib/` import `features/`; giữa các feature không có luật nào, nên
các ranh giới trên chỉ giữ được bằng thói quen.

## Decision

1. **`ChannelScope`** (`features/messages/channel-scope.ts`) là union `server` | `dm`, quyết định một
   lần ở nơi dựng `MessagePane` (`ChannelView`, `DmView`). `MessagePane` và `MessageComposer` nhận
   `scope` thay cho `serverId` + `dm`. Scope mang `messagePath(messageId)` do nơi dựng cấp, vì chỉ nó
   biết route; DM mang thêm mốc đã đọc và `onSendError`. Nơi dựng phải giữ scope ổn định (`useMemo`),
   và nên tạo `messagePath` bằng `useCallback` riêng để mốc đã đọc đổi không làm đổi `jumpTo`.
2. **`messages` không import `dms`, `servers`, `channels`, `shell`.**
3. **`realtime` không import feature nào.** `useChannelRealtime` chuyển sang `messages/hooks` (chỉ
   messages dùng); `RealtimeProvider` chuyển sang `features/shell/components`, cạnh `AppShell`, vì nó
   là gốc ghép nối sự kiện socket của mọi feature.
4. Chỗ ép kiểu socket duy nhất là `onServerEvent` trong `realtime/socket.ts`, kèm lý do: socket.io
   không suy được kiểu listener khi tên sự kiện là tham số generic.
5. Hook cuộn sở hữu cờ cuộn xuống: `useMessageScroll` trả `scrollToEndOnNextAppend`, hook gửi tin nhận
   nó như callback `onWillAppend`.
6. **`profile` không import `messages`.** Khi hồ sơ đổi (`user.updated`), việc vá tên và avatar của tác
   giả trong cache tin do `messages` tự làm: `applyAuthorUpdated` nằm trong `message-cache/` và được
   `createMessageEventHandlers` (`userUpdated`) gọi, chỉ với các query khoá `messages`. Trước đây
   `profile` đi qua mọi query bắt đầu bằng `'channels'`, nên cũng chạm cả cache ghim (một mảng) và làm
   hàm vá ném `TypeError` khi có `user.updated` lúc panel ghim đang mở.
7. Ba luật ESLint (`apps/web/eslint.config.mjs`) giữ các mục 2, 3 và 6.
8. **Áp lại trên `features/dms` để kiểm khuôn có dùng được cho feature khác không** (không chỉ
   messages): `dmAbilityFor` tách luật quyền DM thành hàm thuần có test; `dmViewState` thay bốn
   nhánh if-else lồng nhau trong `DmView` bằng một union `loading | error | notFound | ready` có
   hàm chọn, test đủ nhánh; `DmHeader`/`DmBlockedBanner` tách phần hiển thị khỏi `DmView`.
9. **`ServerPermissionContext.serverId` đổi từ sentinel `''` sang `string | null`.** `DmAbilityProvider`
   từng cấp `{ serverId: '', ready: true }` — một chuỗi rỗng giả để nói "không có server". Mọi nơi đọc
   phải tự biết quy ước đó (`serverId ?? ''`, `serverId={serverId}` rồi API tự chặn bằng chuỗi rỗng).
   Đổi kiểu thành `string | null` nói đúng "không thuộc server nào"; nơi chỉ sống trong vùng server
   đọc qua `useCurrentServerId()` (ném lỗi nếu gọi ở DM) thay vì rải `?? ''`. Đây là ví dụ cụ thể của
   nguyên tắc chung: **ưu tiên `null` để nói "không có" hơn một giá trị rỗng giả**, trừ khi nơi dùng
   đã tự chặn bằng `enabled`/điều kiện tương đương — khi đó chuỗi rỗng chỉ là kiểu giữ chỗ, không phải
   sentinel cần sửa (ví dụ `useEmojisQuery(serverId ?? '')` có `enabled: serverId !== ''`).
10. **Luật ranh giới giữa feature nhắm vào gốc ghép, không chặn cả cây.** Cả `dms` và `channels` import
    `features/shell/store` (một store Zustand không phụ thuộc gì, chỉ giữ trạng thái drawer điều hướng)
    — đó là một lá dùng chung hợp lệ, không phải vi phạm hướng phụ thuộc. Luật "feature X không import
    feature Y" nên viết cho `Y/components` (gốc ghép, nơi nối nhiều thứ lại) chứ không phải toàn bộ `Y`,
    và chỉ thêm sau khi đã thấy một vi phạm thật — không vẽ sẵn bản đồ phụ thuộc cho mọi feature rồi ép
    lint, vì luật đoán trước sẽ chặn nhầm việc hợp lệ và mất uy tín.

## Alternatives

- **Để `realtime` import `messages`, chỉ cấm import mới**: rẻ nhưng giữ một vòng phụ thuộc ở mức
  feature mà người sau phải biết để tránh.
- **Đưa hàm dựng route vào `lib/`** để messages tự gọi theo scope: bỏ được `messagePath` trong scope,
  nhưng `lib/` bị cấm import `features/` nên phải kéo cả hai bộ route ra khỏi `dms` và `servers`: lan
  rộng hơn nhiều so với lợi ích.
- **`eslint-plugin-boundaries` hoặc `import/no-cycle`**: kiểm cả đồ thị nhưng thêm một dependency
  (và `no-restricted-imports` có sẵn), trong khi hai luật hiện tại đã đủ cho hai ranh giới cần giữ.

## Consequences

- Thêm một loại kênh mới (ngoài server và DM) là thêm một nhánh union. `serverIdOf` và `isDmScope` dùng
  `switch` đầy đủ nên chúng không biên dịch được cho tới khi loại mới được quyết định ở đó. Các chỗ khác
  đọc `scope.kind` trực tiếp để thu hẹp kiểu (ví dụ chỉ kênh server có bảng sticker) và không tự báo khi
  có loại mới.
- `messages` đọc và test được tách khỏi route; `realtime` không còn kéo theo cả app.
- Chỉ ba ranh giới trên được ép bằng lint (messages, realtime, profile). Các feature khác vẫn import
  nhau tự do (ví dụ `channels` và `dms` import `messages`, đúng hướng); muốn khoá thêm thì thêm khối
  tương tự, theo nguyên tắc ở mục 10.
- Đổi chữ ký công khai của `MessagePane`: gọi nó phải dựng `ChannelScope` đúng cách (memo hoá).
- `dms` sau khi áp khuôn: tỉ lệ dòng test trên dòng nguồn từ 7% lên 17% (1 file test → 4 file); 0 chỗ
  logic có nhánh còn thiếu test; 0 sentinel kiểu còn lại trong context quyền dùng chung.
- Khuôn chung cho một feature (các lớp, chiều phụ thuộc, cách tránh sentinel, khi nào thêm lint) nằm ở
  skill `ping-feature-structure` (mục "Mẫu cấu trúc feature" và "Ranh giới giữa các feature"), không
  lặp lại ở đây; ADR này chỉ ghi quyết định và bằng chứng cụ thể của hai feature đã áp dụng.
