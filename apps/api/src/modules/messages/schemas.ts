import { z } from 'zod';

export const listMessagesQuerySchema = z
  .object({
    // Cursor về quá khứ: trả các tin CŨ HƠN id này, mới nhất trước (keyset, không OFFSET).
    before: z.uuid().optional(),
    // Cursor về tương lai (T4.4, ADR-0044): trả các tin MỚI HƠN id này, thứ tự tăng dần —
    // vá khoảng trống khi reconnect. Chỉ chọn một trong hai chiều.
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((value) => !(value.before !== undefined && value.after !== undefined), {
    message: 'Provide either before or after, not both',
  });
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
