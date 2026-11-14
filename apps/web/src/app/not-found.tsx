'use client';

import { useTranslations } from 'use-intl';
import { PingLinkButton } from '@/components/ui/ping-link-button';
import { Providers } from '@/providers/providers';

/**
 * 404 của cả app. URL không khớp route nào nên không đi qua layout nhóm nào — phải tự bọc
 * `Providers` (không lồng thêm vì chỉ `notFound()` ngoài nhóm mới rơi vào file này).
 */
export default function NotFound() {
  return (
    <Providers>
      <NotFoundContent />
    </Providers>
  );
}

function NotFoundContent() {
  const t = useTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('app.notFoundTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('app.notFoundHint')}</p>
      <PingLinkButton variant="primary" href="/servers">
        {t('common.goHome')}
      </PingLinkButton>
    </main>
  );
}
