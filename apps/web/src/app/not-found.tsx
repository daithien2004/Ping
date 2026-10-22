'use client';

import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';

/** 404 của cả app, nằm trong root layout nên có đủ provider và ngôn ngữ. */
export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="m-auto flex flex-col items-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('app.notFoundTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('app.notFoundHint')}</p>
      <Button asChild>
        <Link href="/servers">{t('common.goHome')}</Link>
      </Button>
    </main>
  );
}
