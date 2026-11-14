'use client';
import type { MessageStickerPreview } from '@ping/shared';
import { useCallback, useState } from 'react';
import { useTranslations } from 'use-intl';
import { profileImageUrl } from '@/features/profile/hooks';
import { usePrefersReducedMotion } from '@/features/gifs/use-prefers-reduced-motion';

export function StickerMessage({ sticker }: { sticker: MessageStickerPreview | null }) {
  const t = useTranslations('stickers');
  const reduced = usePrefersReducedMotion();
  const [broken, setBroken] = useState(false);
  const src = sticker?.deleted === false && sticker.url ? profileImageUrl(sticker.url) : undefined;
  const source = reduced && sticker?.previewUrl ? profileImageUrl(sticker.previewUrl) : src;
  // onError gắn qua ref: handler DOM trực tiếp bắt lỗi tải ảnh mà không đụng rule a11y.
  const bindError = useCallback((el: HTMLImageElement | null) => {
    if (el) el.onerror = () => setBroken(true);
  }, []);

  if (!sticker || sticker.deleted || !source || broken) {
    return (
      <p
        data-testid="sticker-deleted"
        className="inline-flex items-center gap-2 rounded-lg border border-dashed bg-muted px-3 py-2 text-xs text-muted-foreground"
      >
        {t('deleted')}
      </p>
    );
  }
  return (
    <img
      ref={bindError}
      src={source}
      alt={sticker.name}
      width={sticker.width ?? undefined}
      height={sticker.height ?? undefined}
      data-testid="sticker-image"
      className="max-h-40 max-w-40 object-contain"
    />
  );
}
