import { z } from 'zod';
import type { MessageAuthor } from '../events';

/**
 * TG.9 (ADR-0070): mức cho phép DM. `'all'` (ai cũng nhắn được) chờ TG.15 (bạn bè) tạo đường
 * gặp user ngoài server chung — v0.2.0 chỉ có hai mức này.
 */
export const DM_ALLOW_VALUES = ['server_members', 'none'] as const;
export type DmAllow = (typeof DM_ALLOW_VALUES)[number];
export const dmAllowSchema = z.enum(DM_ALLOW_VALUES);

/** PATCH /users/me phần riêng tư (TG.9): bật/tắt nhận DM từ thành viên server chung. */
export const updatePrivacySchema = z.object({ dmAllow: dmAllowSchema });
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;

/** POST /dms (TG.9): get-or-create idempotent theo cặp — cặp đã có trả 200 với channel cũ. */
export const createDmSchema = z.object({ userId: z.uuid() });
export type CreateDmInput = z.infer<typeof createDmSchema>;

/** Một hội thoại DM của người gọi (ADR-0070 mục 7): đối tác + con trỏ đọc + badge unread. */
export interface DmSummary {
  channelId: string;
  partner: MessageAuthor;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastMessageAt: string | null;
}

export interface DmListResponse {
  dms: DmSummary[];
}
