'use client';

import { useTranslations } from 'use-intl';
import { EmojiSection } from './emoji-section';
import { StickerSection } from './sticker-section';

export function StickerManager({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  return (
    <section
      aria-label={t('stickers')}
      className="flex flex-col gap-3"
      data-testid="sticker-section"
    >
      <StickerSection serverId={serverId} />
      <EmojiSection serverId={serverId} />
    </section>
  );
}
