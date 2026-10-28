'use client';

import { useEffect, useState } from 'react';
import type { EmojiEntry } from './data';
import { emojiMatchesSearch } from '@/features/emojis/emoji-utils';
import { useEmojiMap } from '@/features/emojis/hooks';

/**
 * Một mục gợi ý khi gõ `:abc…` (TG.23/TG.24): emoji hệ thống có `unicode`, emoji server
 * (tùy chỉnh) có `id` + `imageUrl` — "nếu entry có id thì là custom".
 */
export interface EmojiSuggestion {
  /** TG.24: id emoji server — có id thì chèn token `:ten:<id>` thay vì `:shortcode:`. */
  id?: string;
  /** Ảnh nhỏ hiển thị trong danh sách gợi ý cho emoji server (previewUrl tĩnh nếu có). */
  imageUrl?: string;
  unicode?: string;
  /** Hệ thống: shortcode; server: tên emoji ([a-z0-9_]). */
  shortcode: string;
  keywords: string[];
}

/**
 * Gợi ý shortcode khi người dùng đang gõ `:abc…` trong composer (TG.23). Dataset nặng
 * (~268 emoji + từ khóa vi/en) nên tải động ĐÚNG LÚC người dùng gõ `:` đầu tiên và cache
 * — không đụng bundle ban đầu (ADR-0058). TG.24 (ADR-0068): gộp emoji server khớp fragment
 * (tìm không dấu qua foldVi) vào CUỐI danh sách, sau emoji hệ thống.
 */
export function useEmojiSuggestions(fragment: string | null, serverId?: string): EmojiSuggestion[] {
  const [all, setAll] = useState<EmojiEntry[] | null>(null);
  const serverEmojis = useEmojiMap(serverId);

  useEffect(() => {
    if (fragment === null || all !== null) return;
    void import('./data').then((module) => setAll(module.EMOJI_DATA));
  }, [fragment, all]);

  if (fragment === null || all === null) return [];

  const q = fragment.toLowerCase();
  const system: EmojiSuggestion[] = all
    .filter(
      (entry) =>
        entry.shortcode.startsWith(q) || entry.keywords.some((word) => word.includes(fragment)),
    )
    .slice(0, 5)
    .map((entry) => ({
      unicode: entry.unicode,
      shortcode: entry.shortcode,
      keywords: entry.keywords,
    }));
  const custom: EmojiSuggestion[] = [...serverEmojis.values()]
    .filter((emoji) => emojiMatchesSearch(emoji, fragment))
    .slice(0, 5)
    .map((emoji) => ({
      id: emoji.id,
      imageUrl: emoji.previewUrl || emoji.url,
      shortcode: emoji.name,
      keywords: [],
    }));
  return [...system, ...custom];
}
