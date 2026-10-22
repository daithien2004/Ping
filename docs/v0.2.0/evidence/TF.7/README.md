# TF.7 — Composer (ô soạn tin)

- Ngày: 2026-10-22.
- Người thực hiện: chủ repo, nhánh `chore/tf.7-composer`, base commit `e7d6ee1`.
- Task: TF.7 (Pha 3/4).

## Thay đổi

- `apps/web/src/features/messages/components/message-composer.tsx`: chuyển từ shadcn `Textarea` sang
  `PingTextArea` (Ant Design), tự giãn chiều cao (`autoSize` min 1 max 8 rows), đếm ký tự khi gần 4000,
  giữ Enter/Shift+Enter, maxLength 4000, rate-limit friendly (không gửi nếu parse fail).
- `apps/web/src/components/ui/ping-textarea.tsx`: mở rộng props (onKeyDown, autoSize, maxLength, aria-label, data-testid).

## Kiểm chứng

| Tiêu chí      | Lệnh                             | Kết quả   |
| ------------- | -------------------------------- | --------- |
| Web tests     | `pnpm --filter web test`         | pass (96) |
| Typecheck web | `pnpm --filter web typecheck`    | pass      |
| Lint web      | `pnpm --filter web lint`         | pass      |
| Build web     | `pnpm --filter web build`        | pass      |
| Bundle        | `pnpm --filter web check:bundle` | pass      |

## Giới hạn

- @mention gợi ý (PingMentionInput) đã tạo component nhưng chưa nối vào composer; sẽ nối ở TG.x.
- Chưa có test e2e mention; sẽ thêm khi làm TG (reply/reaction).
