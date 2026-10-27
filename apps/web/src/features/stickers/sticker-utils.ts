import type { StickerDto } from '@ping/shared';
import { foldVi } from '@/features/emoji/fold-vi';

/** Số sticker tối đa lưu trong "Gần đây" (localStorage) — như emoji picker (TG.23). */
export const STICKER_RECENT_MAX = 24;
const RECENT_KEY = 'ping.sticker-recent';

/** Tìm theo tên + thẻ, không dấu ("nguoi nham" trúng "người nhắm") — TG.22. */
export function stickerMatchesSearch(sticker: StickerDto, query: string): boolean {
  const q = foldVi(query.trim().toLowerCase());
  if (q === '') return true;
  return (
    foldVi(sticker.name.toLowerCase()).includes(q) ||
    sticker.tags.some((tag) => foldVi(tag.toLowerCase()).includes(q))
  );
}

export function loadRecentStickers(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Ghim một id vào đầu danh sách gần đây (một lần duy nhất), trần {@link STICKER_RECENT_MAX}. */
export function pushRecentSticker(recent: string[], stickerId: string): string[] {
  return [stickerId, ...recent.filter((id) => id !== stickerId)].slice(0, STICKER_RECENT_MAX);
}

export function saveRecentStickers(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, STICKER_RECENT_MAX)));
  } catch {
    // localStorage đầy/bị chặn: bỏ qua — tính năng gần đây là tiện ích, không phải dữ liệu.
  }
}
