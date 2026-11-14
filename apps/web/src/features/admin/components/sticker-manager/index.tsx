'use client';

import { useTranslations } from 'use-intl';
import { EmojiSection } from './emoji-section';
import { StickerSection } from './sticker-section';

/**
 * Quản lý biểu cảm của server (TG.22 + TG.24, ADR-0067/0068): khối sticker rồi khối emoji —
 * cùng section vì cùng nhóm quyền `manage Sticker` (MANAGE_EXPRESSIONS).
 */
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
