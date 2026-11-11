# features/messages

Danh sách tin, ô soạn, thao tác trên tin (sửa, xoá, ghim, reaction, trả lời) và hỏi Ping, dùng chung cho
kênh của server và DM. Feature này là mẫu cho cách tổ chức một feature; lý do các ranh giới ở
[ADR-0085](../../../../../docs/adr/0085-ranh-gioi-feature-messages-realtime.md).

## Các lớp

| Lớp       | Chứa                                          | Ví dụ                                                                                          |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hàm thuần | Không React, không tác dụng phụ, có test cạnh | `message-cache/`, `grouping.ts`, `channel-scope.ts`, `outgoing-message.ts`, `unread-cursor.ts` |
| Hook      | State và logic của một trách nhiệm            | `hooks/` (dữ liệu, cache, socket), `message-pane/use-*.ts` (cuộn, gửi, đọc, nhảy tới tin)      |
| Hiển thị  | JSX từ props, tự gọi `useTranslations`        | `message-item/`, `message-reactions/`, `message-composer/*-list.tsx`                           |
| Gốc ghép  | Gắn hook với component, chặn quyền, bố cục    | `message-pane/index.tsx`, `message-composer/index.tsx`                                         |

Cache TanStack Query là nguồn sự thật duy nhất của danh sách tin: tin tạm (`temp-<nonce>`), tin từ API và
tin từ socket đi qua cùng `upsertMessage` nên không lặp.

## Cái bên ngoài được dùng

`components/message-pane` (`MessagePane`), `channel-scope` (kiểu `ChannelScope`), `hooks`,
`message-cache`, `components/pinned-panel`, `components/ask-dialog`, `components/message-list-skeleton`.

## Quy tắc ranh giới

- Kênh là server hay DM chỉ được quyết định ở nơi dựng `MessagePane`, qua `ChannelScope`. Bên trong chỉ
  đọc `scope.kind`; không suy ra từ `serverId === null`.
- `messages` không import `dms`, `servers`, `channels`, `shell`; `realtime` và `profile` không import
  `messages`. ESLint chặn cả ba. Hồ sơ đổi thì `messages` tự vá tên tác giả trong cache tin.
- Nơi dựng `ChannelScope` phải giữ nó ổn định (`useMemo`) và tạo `messagePath` bằng `useCallback`.

## Kiểm thử

Repo không có jsdom, nên: logic thuần test bằng vitest cạnh file (`*.test.ts`); hook có effect và component
dựa vào e2e (`apps/web/e2e`: `messages`, `reply`, `pin`, `reaction`, `permalink`, `gap-recovery`,
`chaos-gap`, `dm`, `gif`, `sticker`, `emoji`, `attachment`, `keyboard`, `a11y`, `realtime`,
`mark-read-retry`, `unread-ui`, `markdown`). Đổi hook có effect thì chạy các spec này.

Đừng đổi tên `data-testid` / `data-slot`: test và skin bám vào chúng.
