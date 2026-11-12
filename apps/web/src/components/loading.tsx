'use client';

import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';

export function Loading({ className = 'text-sm text-muted-foreground' }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <p
      data-slot="loading"
      className={cn('flex min-h-40 w-full flex-1 items-center justify-center', className)}
    >
      <span data-slot="loading-label">{t('loading')}</span>
    </p>
  );
}
