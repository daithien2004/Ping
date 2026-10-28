import { z } from 'zod';

/**
 * Emoji tùy chỉnh theo server (TG.24, ADR-0068). Token trong tin nhắn là `:ten:<id>` — id
 * UUID là nguồn sự thật, tên chỉ dùng hiển thị fallback và gợi ý; trong reaction là `c:<id>`
 * (38 ký tự, gọn hơn và phân biệt ngay bằng tiền tố `c:`).
 */
export const CUSTOM_EMOJI_NAME = /^[a-z0-9_]{2,32}$/;

export const createCustomEmojiSchema = z.object({
  attachmentId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .refine((name) => CUSTOM_EMOJI_NAME.test(name), 'name must be [a-z0-9_] 2–32'),
});
export type CreateCustomEmojiInput = z.infer<typeof createCustomEmojiSchema>;

/** Một emoji trả về cho picker/quản trị. `url`/`previewUrl` là URL hồ sơ sống 30 ngày. */
export interface CustomEmojiDto {
  id: string;
  name: string;
  /** Ảnh động được giữ chuyển động (worker reencode WebP động ≤128×128). */
  animated: boolean;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

/** GET /servers/:id/emojis — toàn bộ emoji còn sống của server (trần 50+50 nên trả mảng). */
export interface CustomEmojiListResponse {
  emojis: CustomEmojiDto[];
}

/** Token đầy đủ trong nội dung tin nhắn: `:ten:<id>`. */
export function customEmojiToken(name: string, id: string): string {
  return `:${name}:${id}`;
}

/** Regex trích token custom emoji khỏi nội dung tin (khớp parser TG.4 ở web). */
export const CUSTOM_EMOJI_TOKEN_PATTERN =
  /:([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

/** Token reaction cho emoji tùy chỉnh: `c:<id>`. */
export function customEmojiReactionToken(id: string): string {
  return `c:${id}`;
}

export const CUSTOM_EMOJI_REACTION_PATTERN =
  /^c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
