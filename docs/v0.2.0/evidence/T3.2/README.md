# Bằng chứng T3.2 - Quản lý channel trong bề mặt quản trị

## Phạm vi

- Tạo/đổi tên/xóa channel trong bề mặt quản trị, chỉ theo quyền `manage Channel`; thành viên không có quyền không thấy section.
- `PATCH /channels/:channelId`, `DELETE /channels/:channelId` dùng schema shared; audit `CHANNEL_UPDATE` với `{from,to}` trong transaction khi đổi tên.
- Realtime `channel.created/updated/deleted` phát tới room `server:<id>` (có `RealtimeService.emitToServer`), cập nhật cache `qk.channels` và `useChannelEvents` (xóa query messages, redirect khi đang xem channel bị xóa).
- Dialog tạo/đổi tên dùng `PingModal/PingForm/PingInput`; UI toàn bộ qua i18n.

## Files chính

- API: `apps/api/src/modules/channels/*`, `apps/api/src/modules/realtime/realtime.service.ts`, migration `apps/api/prisma/migrations/20261023140000_audit-channel-update/`
- Shared: `packages/shared/src/schemas/channel.ts`, `packages/shared/src/events.ts`, `packages/shared/src/schemas/audit.ts`
- Web: `apps/web/src/features/channels/*`, `apps/web/src/features/admin/components/channel-manager.tsx`, `apps/web/src/features/realtime/components/realtime-provider.tsx`, messages `vi.json`/`en.json`

## Kiểm thử

- `pnpm --filter shared typecheck` / build pass
- `pnpm --filter api test` 38 pass
- `pnpm --filter web test` 114 pass
- `pnpm --filter api test:e2e` 147 pass (24 file)
- `pnpm --filter web exec playwright test e2e/admin-surface.spec.ts` pass
- `pnpm --filter web lint`, `pnpm --filter api lint`, `pnpm format:check`, `pnpm docs:check` pass
- `pnpm --filter web build` pass; `pnpm check:bundle` (trong `apps/web`): JS tải ban đầu 243.6 KB gzip (<=450)

## Ghi chú

- Nhánh `feat/t3.2-channel-management`, base `0644a3e`. Chưa commit.
- Migration đã apply local.
