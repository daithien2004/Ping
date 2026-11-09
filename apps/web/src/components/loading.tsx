'use client';

import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';

/** `fullScreen`: fallback cấp trang, cao cả màn hình (antd App bọc div cao theo nội dung). */
export function Loading({
  className = 'text-sm text-muted-foreground',
  fullScreen = false,
}: {
  className?: string;
  fullScreen?: boolean;
}) {
  const t = useTranslations('common');
  return (
    <p
      data-slot="loading"
      className={cn(
        'flex w-full items-center justify-center',
        fullScreen ? 'min-h-dvh' : 'min-h-40 flex-1',
        className,
      )}
    >
      <span data-slot="loading-label">{t('loading')}</span>
    </p>
  );
}
