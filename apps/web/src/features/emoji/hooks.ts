'use client';

import { useEffect, useState } from 'react';
import type { EmojiEntry } from './data';
import { emojiMatchesSearch } from '@/features/emojis/emoji-utils';
import { useEmojiMap } from '@/features/emojis/hooks';

export interface EmojiSuggestion {
  /** Có id thì chèn token `:ten:<id>` thay vì `:shortcode:`. */
  id?: string;
  imageUrl?: string;
  unicode?: string;
  /** Hệ thống: shortcode; server: tên emoji ([a-z0-9_]). */
  shortcode: string;
  keywords: string[];
}

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
