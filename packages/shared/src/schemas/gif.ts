import { z } from 'zod';

/**
 * TG.25 (ADR-0069): host ảnh GIF được phép nhúng vào tin. Backend là cổng duy nhất gọi nhà
 * cung cấp; client gửi URL đã chọn, API chỉ nhận URL https thuộc danh sách này (chặn sớm
 * trước CSP — CSP `img-src` ở web mở đúng các origin này).
 */
export const GIF_IMAGE_HOSTS = ['media.tenor.com'] as const;

export type GifProvider = 'tenor';

/** Một GIF trả về từ cổng `/gifs/*` của backend — client không gọi nhà cung cấp trực tiếp. */
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

/**
 * Payload gửi tin GIF: grid trả về gì client gửi lại nguyên. URL ràng buộc host allowlist;
 * kích thước chỉ để client dựng layout trước khi ảnh tải (không phải nguồn sự thật an toàn).
 */
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

/** Xem trước GIF nhúng trong tin (server dựng từ cột trên Message, không resolve thêm). */
export interface MessageGifPreview {
  url: string;
  width: number;
  height: number;
  provider: GifProvider;
}
