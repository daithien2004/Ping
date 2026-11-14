import { z } from 'zod';
import type { MessageAuthor } from '../events';

export const DM_ALLOW_VALUES = ['server_members', 'none'] as const;
export type DmAllow = (typeof DM_ALLOW_VALUES)[number];
export const dmAllowSchema = z.enum(DM_ALLOW_VALUES);

export const updatePrivacySchema = z.object({ dmAllow: dmAllowSchema });
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;

export interface UserPrivacyDto {
  dmAllow: DmAllow;
}

/** Get-or-create idempotent theo cặp: cặp đã có trả 200 với channel cũ. */
export const createDmSchema = z.object({ userId: z.uuid() });
export type CreateDmInput = z.infer<typeof createDmSchema>;

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
