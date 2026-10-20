'use client';
import { useTranslations } from 'use-intl';
import { useTypingCount } from '../hooks';

export function TypingIndicator({ channelId }: { channelId: string }) {
  const count = useTypingCount(channelId);
  const t = useTranslations('realtime');
  return (
    <div role="status" className="h-6 shrink-0 px-4 text-xs text-muted-foreground">
      {count ? t('typing', { count }) : ''}
    </div>
  );
}
