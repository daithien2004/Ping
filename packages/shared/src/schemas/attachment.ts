import { z } from 'zod';

export const AttachmentLimits = {
  PER_MESSAGE: 5,
  FILE_BYTES: 10 * 1024 * 1024,
  IMAGE_PIXELS: 16_000_000,
  URL_SECONDS: 60,
  /** URL hồ sơ (avatar/icon) sống lâu để event `user.updated` render được ở mọi client (TG.7). */
  PROFILE_URL_SECONDS: 30 * 24 * 60 * 60,
} as const;

/** TG.7: đích của một upload. `message` là luồng TG.6; avatar/icon tái dùng pipeline (ADR-0053);
 *  `sticker` là tài nguyên biểu cảm của server (TG.22, ADR-0067). */
export type UploadScope = 'message' | 'avatar' | 'serverIcon' | 'sticker';

export const uploadScopes = ['message', 'avatar', 'serverIcon', 'sticker'] as const;
export const uploadScopeSchema = z.enum(uploadScopes);

/** Ảnh hồ sơ nhỏ hơn tệp tin nhắn: vẫn đi qua cùng giới hạn 10 MiB của pipeline. */
export const PROFILE_FILE_BYTES = 5 * 1024 * 1024;

/** Sticker nhỏ hơn nữa (ADR-0067): tệp gốc tối đa 512 KiB, worker xuất WebP ≤ 512×512. */
export const STICKER_FILE_BYTES = 512 * 1024;

/**
 * Luồng TG.6: `message` bắt buộc channelId (không kèm serverId — server suy từ channel);
 * `avatar` không thuộc server/channel nào; `serverIcon` gắn server, không qua channel;
 * `sticker` gắn server (người upload phải có `manage Sticker` của server đó).
 */
export const createUploadSchema = z
  .object({
    scope: uploadScopeSchema.default('message'),
    channelId: z.uuid().optional(),
    serverId: z.uuid().optional(),
    nonce: z.uuid(),
    filename: z
      .string()
      .min(1)
      .max(180)
      .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name)),
    sizeBytes: z.number().int().min(1).max(AttachmentLimits.FILE_BYTES),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'message') {
      if (!value.channelId) ctx.addIssue({ code: 'custom', message: 'channelId required' });
      if (value.serverId) ctx.addIssue({ code: 'custom', message: 'serverId forbidden' });
      return;
    }
    if (value.channelId) ctx.addIssue({ code: 'custom', message: 'channelId forbidden' });
    if (value.scope === 'sticker') {
      if (!value.serverId) ctx.addIssue({ code: 'custom', message: 'serverId required' });
      if (value.sizeBytes > STICKER_FILE_BYTES)
        ctx.addIssue({ code: 'custom', message: 'sticker file too large' });
      return;
    }
    if (value.sizeBytes > PROFILE_FILE_BYTES)
      ctx.addIssue({ code: 'custom', message: 'profile file too large' });
    if (value.scope === 'avatar' && value.serverId)
      ctx.addIssue({ code: 'custom', message: 'serverId forbidden' });
    if (value.scope === 'serverIcon' && !value.serverId)
      ctx.addIssue({ code: 'custom', message: 'serverId required' });
  });
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export interface AttachmentDto {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}
export interface UploadDto {
  id: string;
  status:
    | 'pending'
    | 'uploaded'
    | 'queued'
    | 'processing'
    | 'ready'
    | 'rejected'
    | 'deleting'
    | 'deleted';
  attachment: AttachmentDto | null;
}
export interface AttachmentLink {
  url: string;
  expiresAt: string;
}
export const downloadQuerySchema = z.object({ thumbnail: z.enum(['1']).optional() });
export const signedFileQuerySchema = z.object({
  /** Có `user` = URL tin nhắn (ràng buộc người xem, 60 giây); không có = URL hồ sơ TG.7. */
  user: z.uuid().optional(),
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  thumbnail: z.enum(['1']).optional(),
});
export type SignedFileQuery = z.infer<typeof signedFileQuerySchema>;
