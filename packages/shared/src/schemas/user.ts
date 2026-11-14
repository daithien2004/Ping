import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(32).optional(),
    avatarAttachmentId: z.uuid().optional(),
  })
  .refine((value) => value.displayName !== undefined || value.avatarAttachmentId !== undefined, {
    message: 'nothing to update',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateNicknameSchema = z.object({
  nickname: z.string().trim().min(1).max(32).nullable(),
});
export type UpdateNicknameInput = z.infer<typeof updateNicknameSchema>;
