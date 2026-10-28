'use client';
import type { MessageStickerPreview } from '@ping/shared';
import { useCallback, useState } from 'react';
import { useTranslations } from 'use-intl';
import { profileImageUrl } from '@/features/profile/hooks';
import { usePrefersReducedMotion } from '@/features/gifs/use-prefers-reduced-motion';

/**
 * Thân tin sticker (TG.22, ADR-0067): ảnh ≤160px, sticker động tự tĩnh lại khi người dùng
 * bật `prefers-reduced-motion` (dùng khung preview server đã xuất). Sticker bị xóa — hoặc
 * tệp không còn tải được — hiển thị khung "sticker đã bị xóa" thay vì ảnh vỡ.
 */
export function StickerMessage({ sticker }: { sticker: MessageStickerPreview | null }) {
  const t = useTranslations('stickers');
  const reduced = usePrefersReducedMotion();
  const [broken, setBroken] = useState(false);
  const src = sticker?.deleted === false && sticker.url ? profileImageUrl(sticker.url) : undefined;
  const source = reduced && sticker?.previewUrl ? profileImageUrl(sticker.previewUrl) : src;
  // onError gắn qua ref thay vì prop JSX: handler DOM trực tiếp vẫn bắt lỗi tải ảnh (tệp đã
  // bị dọn, cache còn URL cũ) mà không đụng rule a11y cấm handler trên phần tử phi tương tác.
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
    // onError: tệp đã bị dọn (sticker vừa xóa, cache còn URL cũ) → đổi sang khung "đã xóa".
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
