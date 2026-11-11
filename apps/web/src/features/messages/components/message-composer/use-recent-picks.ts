'use client';

import type { GifPayload } from '@ping/shared';
import { useState } from 'react';
import { useMe } from '@/features/auth/hooks';
import { loadRecentGifs, pushRecentGif, saveRecentGifs } from '@/features/gifs/gif-utils';
import { loadRecentStickers, pushRecentSticker } from '@/features/stickers/sticker-utils';

export function useRecentPicks() {
  const { data: me } = useMe();
  const [recentStickers, setRecentStickers] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadRecentStickers(),
  );
  const [recentGifs, setRecentGifs] = useState<GifPayload[]>(() =>
    me ? loadRecentGifs(me.id) : [],
  );

  const addSticker = (stickerId: string) =>
    setRecentStickers((prev) => pushRecentSticker(prev, stickerId));

  const addGif = (gif: GifPayload) => {
    const next = pushRecentGif(recentGifs, gif);
    setRecentGifs(next);
    if (me) saveRecentGifs(me.id, next);
  };

  return { recentStickers, recentGifs, addSticker, addGif };
}
