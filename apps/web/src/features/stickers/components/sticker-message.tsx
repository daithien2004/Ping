'use client';
import type { MessageStickerPreview } from '@ping/shared';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { profileImageUrl } from '@/features/profile/hooks';

/**
 * `prefers-reduced-motion` đọc một lần lúc mount rồi nghe thay đổi: state đồng bộ với hệ
 * điều hành (bên ngoài) qua effect — không tính dữ liệu trong render.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

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
    // onError chỉ để bắt tệp đã bị dọn (sticker vừa xóa, cache còn URL cũ) và đổi sang khung
    // "đã xóa" — không phải tương tác chuột/bàn phím nên jsx-a11y cho phép loại trừ.
     
    <img
      src={source}
      alt={sticker.name}
      width={sticker.width ?? undefined}
      height={sticker.height ?? undefined}
      onError={() => setBroken(true)}
      data-testid="sticker-image"
      className="max-h-40 max-w-40 object-contain"
    />
  );
}
