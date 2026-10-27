import { z } from 'zod';

/**
 * Tạo sticker trong server (TG.22, ADR-0067): tệp đã qua pipeline upload với scope
 * `sticker` và worker kiểm định xong (`ready`); lệnh này "claim" tệp — một tệp chỉ
 * tạo được một sticker (pattern `boundAt` của TG.7). Trần số lượng kiểm ở service.
 */
export const createStickerSchema = z.object({
  attachmentId: z.uuid(),
  name: z.string().trim().min(1).max(32),
  /** Thẻ tìm kiếm (không dấu được client tự fold): tối đa 8 thẻ, mỗi thẻ ≤ 24 ký tự. */
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
});
export type CreateStickerInput = z.infer<typeof createStickerSchema>;

/** Một sticker trả về cho picker/quản trị. `url`/`previewUrl` là URL hồ sơ sống 30 ngày. */
export interface StickerDto {
  id: string;
  packId: string;
  name: string;
  tags: string[];
  /** WebP đã kiểm định (động hoặc tĩnh) — render khi cho phép chuyển động. */
  url: string;
  /** Khung tĩnh (khung đầu của sticker động, bản nhỏ của sticker tĩnh) — dùng cho
   *  `prefers-reduced-motion` và để bố cục không nhảy khi tải. */
  previewUrl: string;
  width: number | null;
  height: number | null;
}

/** Gói sticker. `serverId` null = gói hệ thống (tài sản của dự án, seed tạo). */
export interface StickerPackDto {
  id: string;
  name: string;
  serverId: string | null;
  stickers: StickerDto[];
}

/** GET /servers/:id/stickers — gói hệ thống + gói của server, sticker đã xóa không trả. */
export interface StickerListResponse {
  packs: StickerPackDto[];
}

/**
 * Xem trước sticker trong tin nhắn (TG.22) — phát qua mọi đường DTO/event như `replyTo`
 * (TG.1). Sticker bị xóa mềm: `deleted: true`, không còn URL (tin cũ render khung
 * "sticker đã bị xóa" thay vì ảnh).
 */
export interface MessageStickerPreview {
  id: string;
  name: string;
  deleted: boolean;
  url: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
}
