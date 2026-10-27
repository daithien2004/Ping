import { z } from 'zod';

/** PATCH /users/me (TG.7): đổi tên hiển thị và/hoặc gắn avatar đã upload qua pipeline TG.6. */
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(32).optional(),
    avatarAttachmentId: z.uuid().optional(),
  })
  .refine((value) => value.displayName !== undefined || value.avatarAttachmentId !== undefined, {
    message: 'nothing to update',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** PATCH /servers/:serverId/members/me (TG.7): đặt/xóa biệt danh của chính mình trong server. */
export const updateNicknameSchema = z.object({
  nickname: z.string().trim().min(1).max(32).nullable(),
});
export type UpdateNicknameInput = z.infer<typeof updateNicknameSchema>;
