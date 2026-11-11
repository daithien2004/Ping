'use client';

import type { GifPayload, StickerDto } from '@ping/shared';
import dynamic from 'next/dynamic';
import { useRecentPicks } from './use-recent-picks';

const StickerPicker = dynamic(
  () => import('@/features/stickers/components/sticker-picker').then((m) => m.StickerPicker),
  { ssr: false },
);

export function StickerPanel({
  serverId,
  onSticker,
  onGif,
}: {
  serverId: string;
  onSticker: (sticker: StickerDto) => void;
  onGif: (gif: GifPayload) => void;
}) {
  const recents = useRecentPicks();
  return (
    <div className="mb-2 flex justify-start">
      <StickerPicker
        serverId={serverId}
        recent={recents.recentStickers}
        recentGifs={recents.recentGifs}
        onPick={(sticker) => {
          recents.addSticker(sticker.id);
          onSticker(sticker);
        }}
        onPickGif={(gif) => {
          recents.addGif(gif);
          onGif(gif);
        }}
      />
    </div>
  );
}
