import { z } from 'zod';

/** Chỉ nhận URL https thuộc host này; CSP `img-src` ở web phải mở đúng các origin này. */
export const GIF_IMAGE_HOSTS = ['media.tenor.com'] as const;

export type GifProvider = 'tenor';

export interface GifDto {
  id: string;
  url: string;
  width: number;
  height: number;
  provider: GifProvider;
}

export interface GifSearchResponse {
  gifs: GifDto[];
}

export const gifPayloadSchema = z.object({
  id: z.string().min(1).max(128),
  url: z
    .string()
    .url()
    .max(2048)
    .refine((url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.protocol === 'https:' &&
          (GIF_IMAGE_HOSTS as readonly string[]).includes(parsed.host)
        );
      } catch {
        return false;
      }
    }, 'gif host not allowed'),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
});
export type GifPayload = z.infer<typeof gifPayloadSchema>;

export interface MessageGifPreview {
  url: string;
  width: number;
  height: number;
  provider: GifProvider;
}
