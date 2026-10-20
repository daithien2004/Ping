'use client';

import { useTranslations } from 'use-intl';

/** Chữ "Đang tải…" theo ngôn ngữ. Client component để layout (Server Component) dùng làm fallback. */
export function Loading({
  className = 'm-auto text-sm text-muted-foreground',
}: {
  className?: string;
}) {
  const t = useTranslations('common');
  return <p className={className}>{t('loading')}</p>;
}
