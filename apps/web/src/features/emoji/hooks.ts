'use client';

import { useEffect, useState } from 'react';
import type { EmojiEntry } from './data';

/**
 * Gợi ý shortcode khi người dùng đang gõ `:abc…` trong composer (TG.23). Dataset nặng
 * (~268 emoji + từ khóa vi/en) nên tải động ĐÚNG LÚC người dùng gõ `:` đầu tiên và cache
 * — không đụng bundle ban đầu (ADR-0058).
 */
export function useEmojiSuggestions(fragment: string | null) {
  const [all, setAll] = useState<EmojiEntry[] | null>(null);

  useEffect(() => {
    if (fragment === null || all !== null) return;
    void import('./data').then((module) => setAll(module.EMOJI_DATA));
  }, [fragment, all]);

  if (fragment === null || all === null) return [];

  const q = fragment.toLowerCase();
  return all
    .filter(
      (entry) =>
        entry.shortcode.startsWith(q) || entry.keywords.some((word) => word.includes(fragment)),
    )
    .slice(0, 5);
}
