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
6. Hai luật ESLint (`apps/web/eslint.config.mjs`) giữ các mục 2 và 3.

## Alternatives

- **Để `realtime` import `messages`, chỉ cấm import mới**: rẻ nhưng giữ một vòng phụ thuộc ở mức
  feature mà người sau phải biết để tránh.
- **Đưa hàm dựng route vào `lib/`** để messages tự gọi theo scope: bỏ được `messagePath` trong scope,
  nhưng `lib/` bị cấm import `features/` nên phải kéo cả hai bộ route ra khỏi `dms` và `servers`: lan
  rộng hơn nhiều so với lợi ích.
- **`eslint-plugin-boundaries` hoặc `import/no-cycle`**: kiểm cả đồ thị nhưng thêm một dependency
  (và `no-restricted-imports` có sẵn), trong khi hai luật hiện tại đã đủ cho hai ranh giới cần giữ.

## Consequences

- Thêm một loại kênh mới (ngoài server và DM) là thêm một nhánh union; TypeScript chỉ ra mọi chỗ
  `switch` chưa xử lý.
- `messages` đọc và test được tách khỏi route; `realtime` không còn kéo theo cả app.
- Chỉ hai ranh giới trên được ép bằng lint. Các feature khác vẫn import nhau tự do (ví dụ `channels`
  và `dms` import `messages`, đúng hướng); muốn khoá thêm thì thêm khối tương tự.
- Đổi chữ ký công khai của `MessagePane`: gọi nó phải dựng `ChannelScope` đúng cách (memo hoá).
