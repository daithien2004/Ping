'use client';
import { useTranslations } from 'use-intl';
import { useConnectionStatus } from '../hooks';

export function ConnectionBanner() {
  const status = useConnectionStatus();
  const t = useTranslations('realtime');
  if (status === 'connected') return null;
  return (
    <div
      role="status"
      className="shrink-0 border-b bg-muted px-4 py-2 text-center text-sm text-muted-foreground"
    >
      {t(status)}
    </div>
  );
}
