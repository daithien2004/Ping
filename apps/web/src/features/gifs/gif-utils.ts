import { ErrorCodes, type GifPayload } from '@ping/shared';
import { ApiError } from '@/lib/api-client';

/** Số GIF tối đa lưu trong "Gần đây" của tab GIF — như sticker gần đây (TG.22) và emoji (TG.23). */
export const GIF_RECENT_MAX = 24;

/**
 * Mục "Gần đây" của GIF (TG.25, ADR-0069): đúng hình dạng payload gửi đi — đủ để render lại lưới
 * và gửi lại mà không cần hỏi server (GIF không phải entity của server). Provider luôn 'tenor'
 * ở v0.2.0 nên không lưu.
 */
export type RecentGif = GifPayload;

/** Khóa localStorage THEO USER: danh sách GIF gần đây là dữ liệu riêng của từng người xem. */
export function recentGifsKey(userId: string): string {
  return `ping.gif-recent.${userId}`;
}

/** Lọc mảng lạ đọc từ localStorage: chỉ giữ mục đủ trường và URL https (GIF chỉ nhúng https). */
export function parseRecentGifs(raw: unknown): RecentGif[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is RecentGif => {
    if (typeof item !== 'object' || item === null) return false;
    const gif = item as Record<string, unknown>;
    return (
      typeof gif.id === 'string' &&
      gif.id.length > 0 &&
      typeof gif.url === 'string' &&
      gif.url.startsWith('https://') &&
      typeof gif.width === 'number' &&
      Number.isInteger(gif.width) &&
      gif.width > 0 &&
      typeof gif.height === 'number' &&
      Number.isInteger(gif.height) &&
      gif.height > 0
    );
  });
}

export function loadRecentGifs(userId: string): RecentGif[] {
  try {
    const raw = localStorage.getItem(recentGifsKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return parseRecentGifs(parsed).slice(0, GIF_RECENT_MAX);
  } catch {
    return [];
  }
}

/** Ghim một GIF vào đầu danh sách gần đây (một bản duy nhất theo id), trần {@link GIF_RECENT_MAX}. */
export function pushRecentGif(recent: RecentGif[], gif: RecentGif): RecentGif[] {
  return [gif, ...recent.filter((item) => item.id !== gif.id)].slice(0, GIF_RECENT_MAX);
}

export function saveRecentGifs(userId: string, list: RecentGif[]): void {
  try {
    localStorage.setItem(recentGifsKey(userId), JSON.stringify(list.slice(0, GIF_RECENT_MAX)));
  } catch {
    // localStorage đầy/bị chặn: bỏ qua — tính năng gần đây là tiện ích, không phải dữ liệu.
  }
}

/**
 * 503 `GIF_PROVIDER_UNAVAILABLE` (thiếu key/quota nhà cung cấp): picker hiện empty state riêng
 * "chưa khả dụng" thay vì câu lỗi chung, chat vẫn gửi/nhận bình thường (ADR-0069).
 */
export function isGifProviderUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCodes.GIF_PROVIDER_UNAVAILABLE;
}
