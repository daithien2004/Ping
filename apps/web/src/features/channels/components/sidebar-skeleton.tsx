'use client';

import { useTranslations } from 'use-intl';
import { BusyRegion } from '@/components/busy-region';
import { PingSkeleton } from '@/components/ui/ping-skeleton';

export function SidebarSkeleton() {
  const t = useTranslations('channels');
  return (
    <BusyRegion
      label={t('loading')}
      className="flex w-sidebar shrink-0 flex-col gap-2 bg-sidebar p-3"
    >
      <PingSkeleton block className="h-10 w-full" />
      {[0, 1, 2, 3].map((index) => (
        <PingSkeleton block key={index} className="h-7 w-full" />
      ))}
    </BusyRegion>
  );
}
