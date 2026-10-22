# TF.6 — Khung chat

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/tf.6-chat-frame`, base commit `e7d6ee1`.
- Task: TF.6 (Pha 3/4).

## Hiện trạng

Khung chat đã được triển khai trong `apps/web/src/features/messages/components/message-pane.tsx` từ v0.1.0:

- Danh sách ảo hóa bằng `@tanstack/react-virtual` (overscan 8, estimateSize 56).
- Neo vị trí khi tải tin cũ (`anchorTo: 'end'`), `followOnAppend` cho tin mới.
- Cuộn xuống cuối khi vào channel (một lần), giữ vị trí khi `<Activity>` ẩn/hiện.
- Tải trang cũ khi cuộn gần đầu (firstVisible ≤ 2).
- Thanh công cụ khi hover, trạng thái gửi/thất bại/thử lại (trong `MessageItem`/`MessageComposer`).
- Vạch "tin mới" + aria-live announce (`incomingMessage`).

## Kiểm chứng

| Tiêu chí      | Lệnh                             | Kết quả         |
| ------------- | -------------------------------- | --------------- |
| Web tests     | `pnpm --filter web test`         | pass (96 tests) |
| Typecheck web | `pnpm --filter web typecheck`    | pass            |
| Lint web      | `pnpm --filter web lint`         | pass            |
| Build web     | `pnpm --filter web build`        | pass            |
| Bundle        | `pnpm --filter web check:bundle` | pass            |

## Giới hạn

- Chưa đo 10.000 tin cuộn mượt (long task > 50 ms) bằng Performance trace; sẽ đo khi có staging/pilot.
- Thư viện danh sách ảo đã chọn `@tanstack/react-virtual` (đang dùng), không cần đổi.
