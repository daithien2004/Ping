import { z } from 'zod';
import { Limits } from '../limits';

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/**
 * PATCH /channels/:id - đổi tên và/hoặc vị trí; phải có ít nhất một trường. `position` Int chỉ
 * sắp kênh trong VÙNG MẶC ĐỊNH (TG.10: thứ tự trong category là `positionKey`, đổi qua
 * PUT /channels/:id/move — endpoint này không đụng category/positionKey/topic).
 */
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
  /** Cursor đã đọc của kênh (T4.3: vạch "tin mới" ở khung chat); null = chưa đọc lần nào. */
  lastReadMessageId: string | null;
}

export interface ChannelDto {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT';
  /**
   * TG.10: vị trí trong VÙNG MẶC ĐỊNH (channel ngoài category) — cột Int cũ, CHỈ có ý nghĩa
   * khi `categoryId` là null. Giữ nguyên hợp đồng cũ để rolling-safe (client cũ vẫn sort theo
   * trường này); channel trong category sắp theo `positionKey` nên `position` của chúng là
   * giá trị cũ vô nghĩa — client PHẢI nhóm theo `categoryId` trước khi sort.
   */
  position: number;
  /** TG.10: category chứa channel; null = vùng mặc định ngoài category. */
  categoryId: string | null;
  /** TG.10: thứ tự TRONG category (lexorank 'a'..'z', so sánh chuỗi); null khi ngoài category. */
  positionKey: string | null;
  /** TG.10: chủ đề hiển thị ở header channel; null = chưa đặt. */
  topic: string | null;
  createdAt: string;
}

/** TG.10: một category trong sidebar. `position` là lexorank so sánh theo chuỗi ('a' < 'aa'). */
export interface ChannelCategoryDto {
  id: string;
  name: string;
  position: string;
}

/** POST /servers/:serverId/categories — tạo category mới (nối cuối danh sách). */
export const createCategorySchema = z.object({ name: z.string().trim().min(1).max(50) });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/** PATCH /servers/:serverId/categories/:categoryId — đổi tên; cùng ràng buộc với tạo mới. */
export const renameCategorySchema = createCategorySchema;
export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;

/**
 * PUT /servers/:serverId/categories/reorder — sắp lại thứ tự TOÀN BỘ category của server
 * theo mảng id. Server kiểm `orderedIds` chứa ĐỦ MỌI category hiện có, mỗi id đúng một lần
 * (thiếu/thừa/trùng → 400); thứ tự trong mảng là thứ tự mới.
 */
export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).max(Limits.MAX_CATEGORIES_PER_SERVER),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

/**
 * PUT /channels/:channelId/move — di chuyển channel vào category (hoặc ra vùng mặc định với
 * `categoryId: null`). `positionKey` do UI tính bằng `rankBetween` (lexorank); BỎ trống khi
 * muốn chèn CUỐI category đích — server tự sinh rank. Server chỉ kiểm hình thức 'a'-'z'
 * (1..64 ký tự), không kiểm vị trí so với láng giềng (UI là nguồn vị trí, server là nguồn dữ liệu).
 */
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

/** PATCH /channels/:channelId/topic — chủ đề hiển thị ở header; chuỗi rỗng = xóa topic. */
export const setTopicSchema = z.object({ topic: z.string().trim().max(200) });
export type SetTopicInput = z.infer<typeof setTopicSchema>;
