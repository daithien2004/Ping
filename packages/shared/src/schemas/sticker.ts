import { z } from 'zod';

/** Một tệp `ready` chỉ tạo được một sticker (claim); trần số lượng kiểm ở service. */
export const createStickerSchema = z.object({
  attachmentId: z.uuid(),
  name: z.string().trim().min(1).max(32),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
});
export type CreateStickerInput = z.infer<typeof createStickerSchema>;

export interface StickerDto {
  id: string;
  packId: string;
  name: string;
  tags: string[];
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

/** `serverId` null = gói hệ thống (seed tạo). */
export interface StickerPackDto {
  id: string;
  name: string;
  serverId: string | null;
  stickers: StickerDto[];
}

export interface StickerListResponse {
  packs: StickerPackDto[];
}

/** Sticker bị xóa mềm: `deleted: true`, không còn URL. */
export interface MessageStickerPreview {
  id: string;
  name: string;
  deleted: boolean;
  url: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
}
