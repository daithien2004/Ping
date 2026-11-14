import { z } from 'zod';

/** Token trong tin là `:ten:<id>`: id UUID là nguồn sự thật, tên chỉ để hiển thị. */
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

export interface CustomEmojiDto {
  id: string;
  name: string;
  animated: boolean;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

export interface CustomEmojiListResponse {
  emojis: CustomEmojiDto[];
}

export function customEmojiToken(name: string, id: string): string {
  return `:${name}:${id}`;
}

/** Phải khớp parser token ở web. */
export const CUSTOM_EMOJI_TOKEN_PATTERN =
  /:([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

export function customEmojiReactionToken(id: string): string {
  return `c:${id}`;
}

export const CUSTOM_EMOJI_REACTION_PATTERN =
  /^c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
