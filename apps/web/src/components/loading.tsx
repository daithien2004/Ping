'use client';

import { useTranslations } from 'use-intl';

/** Chữ "Đang tải…" theo ngôn ngữ. Client component để layout (Server Component) dùng làm fallback. */
export function Loading({ className = 'm-auto text-sm text-gray-500' }: { className?: string }) {
  const t = useTranslations('common');
  return <p className={className}>{t('loading')}</p>;
}
