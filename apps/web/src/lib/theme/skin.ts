import { env } from '../env';
import type { Skin } from './tokens';

export type { Skin };

/**
 * Skin thiết bị (ADR-0076): lưu ở cookie để tab mới/cửa sổ mới nhớ lựa chọn mà không cần
 * đăng nhập, và để visual regression đặt skin trước khi trang tải. Không đọc cookie ở server
 * vì cacheComponents bắt `cookies()` kéo cả cây vào <Suspense> (ADR-0022); store đọc cookie
 * trong trình duyệt và ThemeProvider gắn `data-skin` ngay sau khi hydrate.
 *
 * `NEXT_PUBLIC_ENABLE_PIXEL_SKIN` là hằng build-time (Next inline vào bundle), không phải cờ
 * runtime: tắt bằng `NEXT_PUBLIC_ENABLE_PIXEL_SKIN=false` khi build. Mặc định bật để dev/CI/visual
 * dùng được ngay; khi tắt, lớp CSS và cookie vẫn tồn tại nhưng không có lối chọn trong UI.
 */
export const SKIN_COOKIE = 'ping-skin';
const SKIN_MAX_AGE = 60 * 60 * 24 * 365;

export const PIXEL_SKIN_ENABLED = env.NEXT_PUBLIC_ENABLE_PIXEL_SKIN;

export function parseSkin(value: string | undefined): Skin {
  return value === 'pixel' ? 'pixel' : 'default';
}

export function readSkinCookie(): Skin {
  if (typeof document === 'undefined') return 'default';
  const entry = document.cookie.split('; ').find((item) => item.startsWith(`${SKIN_COOKIE}=`));
  return parseSkin(entry?.split('=')[1]);
}

export function writeSkinCookie(skin: Skin): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SKIN_COOKIE}=${skin}; path=/; max-age=${SKIN_MAX_AGE}; samesite=lax`;
}
