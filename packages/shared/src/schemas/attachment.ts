import { z } from 'zod';

export const AttachmentLimits = {
  PER_MESSAGE: 5,
  FILE_BYTES: 10 * 1024 * 1024,
  IMAGE_PIXELS: 16_000_000,
  URL_SECONDS: 60,
} as const;

export const createUploadSchema = z.object({
  channelId: z.uuid(),
  nonce: z.uuid(),
  filename: z
    .string()
    .min(1)
    .max(180)
    .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name)),
  sizeBytes: z.number().int().min(1).max(AttachmentLimits.FILE_BYTES),
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
  user: z.uuid(),
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  thumbnail: z.enum(['1']).optional(),
});
export type SignedFileQuery = z.infer<typeof signedFileQuerySchema>;
