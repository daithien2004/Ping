'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'use-intl';

export function DmEmpty() {
  const t = useTranslations('dms');
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
      <MessageCircle className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('pickOne')}</p>
    </div>
  );
}
