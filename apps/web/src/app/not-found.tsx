'use client';

import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';

/** 404 của cả app, nằm trong root layout nên có đủ provider và ngôn ngữ. */
export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      {/* Số 404 lớn chỉ hiện ở skin Pop (ẩn mặc định); tiêu đề bên dưới đã nói đủ cho trình đọc. */}
      <p aria-hidden data-slot="not-found-code" className="hidden">
        404
      </p>
      <h1 className="text-xl font-semibold">{t('app.notFoundTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('app.notFoundHint')}</p>
      <PingButton href="/servers">{t('common.goHome')}</PingButton>
    </main>
  );
}
