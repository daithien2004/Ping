import { z } from 'zod';

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/** PATCH /channels/:id - đổi tên và/hoặc vị trí; phải có ít nhất một trường. */
export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    position: z.number().int().min(0).max(999).optional(),
  })
  .refine((value) => value.name !== undefined || value.position !== undefined, {
    message: 'Provide at least a name or a position',
  });
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

/**
 * PUT /channels/:id/read (T4.2, ADR-0043): đánh dấu đã đọc đến `messageId` (phải là tin
 * của đúng channel đó). Chỉ tiến không lùi — server bỏ qua nếu cursor hiện tại đã mới hơn.
 */
export const markChannelReadSchema = z.object({ messageId: z.uuid() });
export type MarkChannelReadInput = z.infer<typeof markChannelReadSchema>;

/** Một dòng trong GET /servers/:id/unread. Đếm có trần (100); tin đã xóa mềm không tính. */
export interface ChannelUnreadDto {
  channelId: string;
  unreadCount: number;
  mentionCount: number;
}

export interface ChannelDto {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT';
  position: number;
  createdAt: string;
}
