import type { StickerDto } from '@ping/shared';
import { foldVi } from '@/lib/fold-vi';

export const STICKER_RECENT_MAX = 24;
const RECENT_KEY = 'ping.sticker-recent';

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

export function pushRecentSticker(recent: string[], stickerId: string): string[] {
  return [stickerId, ...recent.filter((id) => id !== stickerId)].slice(0, STICKER_RECENT_MAX);
}

export function saveRecentStickers(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, STICKER_RECENT_MAX)));
  } catch {
    // localStorage đầy/bị chặn: bỏ qua.
  }
}
