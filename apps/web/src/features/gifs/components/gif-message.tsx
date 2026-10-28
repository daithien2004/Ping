'use client';
import type { MessageGifPreview } from '@ping/shared';
import { useCallback, useState } from 'react';
import { useTranslations } from 'use-intl';
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion';
import { GIF_MAX_HEIGHT, GifPlaceholder } from './gif-placeholder';

/**
 * Thân tin GIF (TG.25, ADR-0069): ảnh kích thước theo width/height do server lưu, trần chiều cao
 * như sticker lớn, giữ tỉ lệ. `prefers-reduced-motion` → KHÔNG tự phát (GIF không có khung tĩnh):
 * render khối giữ chỗ đúng tỉ lệ, bấm mới gắn ảnh thật (một lần, giữ sau đó). URL Tenor chết
 * (nhà cung cấp đổi link) → khung "GIF không còn xem được" thay vì ảnh vỡ, như sticker bị xóa.
 */
export function GifMessage({ gif }: { gif: MessageGifPreview | null }) {
  const t = useTranslations('gifs');
  const reduced = usePrefersReducedMotion();
  const [played, setPlayed] = useState(false);
  const [broken, setBroken] = useState(false);
  // onError gắn qua ref thay vì prop JSX: handler DOM trực tiếp vẫn bắt lỗi tải ảnh (URL đã chết,
  // cache còn link cũ) mà không đụng rule a11y cấm handler trên phần tử phi tương tác.
  const bindError = useCallback((el: HTMLImageElement | null) => {
    if (el) el.onerror = () => setBroken(true);
  }, []);

  if (!gif || broken) {
    return (
      <p
        data-testid="gif-broken"
        className="inline-flex items-center gap-2 rounded-lg border border-dashed bg-muted px-3 py-2 text-xs text-muted-foreground"
      >
        {t('broken')}
      </p>
    );
  }
  if (reduced && !played) {
    return (
      <button
        type="button"
        data-testid="gif-placeholder"
        onClick={() => setPlayed(true)}
        aria-label={t('play')}
        className="block cursor-pointer rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <GifPlaceholder width={gif.width} height={gif.height} label={t('play')} />
      </button>
    );
  }
  return (
    <img
      ref={bindError}
      src={gif.url}
      alt=""
      width={gif.width}
      height={gif.height}
      loading="lazy"
      decoding="async"
      data-testid="gif-image"
      className="h-auto max-w-full rounded-lg"
      style={{ maxHeight: GIF_MAX_HEIGHT }}
    />
  );
}
