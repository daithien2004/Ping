import { z } from 'zod';
import { Limits } from '../limits';

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/** `position` chỉ sắp kênh trong VÙNG MẶC ĐỊNH; thứ tự trong category là `positionKey` (PUT /channels/:id/move). */
export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    position: z.number().int().min(0).max(999).optional(),
  })
  .refine((value) => value.name !== undefined || value.position !== undefined, {
    message: 'Provide at least a name or a position',
  });
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

/** Chỉ tiến không lùi: server bỏ qua nếu cursor hiện tại đã mới hơn. */
export const markChannelReadSchema = z.object({ messageId: z.uuid() });
export type MarkChannelReadInput = z.infer<typeof markChannelReadSchema>;

/** Đếm có trần (100); tin đã xóa mềm không tính. */
export interface ChannelUnreadDto {
  channelId: string;
  unreadCount: number;
  mentionCount: number;
  lastReadMessageId: string | null;
}

export interface ServerUnreadDto {
  serverId: string;
  channels: ChannelUnreadDto[];
}

export interface ChannelDto {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT';
  /** Chỉ có nghĩa khi `categoryId` là null; client PHẢI nhóm theo `categoryId` trước khi sort. */
  position: number;
  categoryId: string | null;
  positionKey: string | null;
  topic: string | null;
  createdAt: string;
}

export interface ChannelCategoryDto {
  id: string;
  name: string;
  position: string;
}

export const createCategorySchema = z.object({ name: z.string().trim().min(1).max(50) });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const renameCategorySchema = createCategorySchema;
export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).max(Limits.MAX_CATEGORIES_PER_SERVER),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

/** `positionKey` bỏ trống = chèn CUỐI category đích; server chỉ kiểm hình thức a-z (1..64), không kiểm vị trí. */
export const moveChannelSchema = z.object({
  categoryId: z.uuid().nullable(),
  positionKey: z
    .string()
    .regex(/^[a-z]+$/, 'positionKey chỉ gồm chữ cái a-z (lexorank)')
    .min(1)
    .max(64)
    .optional(),
});
export type MoveChannelInput = z.infer<typeof moveChannelSchema>;

/** Chuỗi rỗng = xóa topic. */
export const setTopicSchema = z.object({ topic: z.string().trim().max(200) });
export type SetTopicInput = z.infer<typeof setTopicSchema>;
