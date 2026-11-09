'use client';

import { useTranslations } from 'use-intl';
import { BusyRegion } from '@/components/busy-region';
import { PingSkeleton } from '@/components/ui/ping-skeleton';

export function RailSkeleton() {
  const t = useTranslations('servers');
  return (
    <BusyRegion
      label={t('loading')}
      className="flex w-18 shrink-0 flex-col items-center gap-2 bg-rail py-3"
    >
      {[0, 1, 2].map((index) => (
        <PingSkeleton block key={index} className="size-10 rounded-full bg-background/60" />
      ))}
    </BusyRegion>
  );
}
