'use client';

import { useTranslations } from 'use-intl';
import { BusyRegion } from '@/components/busy-region';
import { PingSkeleton } from '@/components/ui/ping-skeleton';

// Hình dạng giống tin thật để lúc dữ liệu về không nhảy chiều cao.
const BLOCKS = [
  { header: 'w-32', lines: ['w-3/4', 'w-1/2'] },
  { header: 'w-24', lines: ['w-full'] },
  { header: 'w-40', lines: ['w-2/3', 'w-1/3'] },
];

export function MessageListSkeleton() {
  const t = useTranslations('messages');
  return (
    <BusyRegion label={t('loading')} className="flex min-h-0 flex-1 flex-col justify-end gap-3 p-4">
      {BLOCKS.map((block) => (
        <div key={block.header} className="flex flex-col gap-2">
          <PingSkeleton block className={`h-4 ${block.header}`} />
          {block.lines.map((width) => (
            <PingSkeleton block key={width} className={`h-4 ${width}`} />
          ))}
        </div>
      ))}
    </BusyRegion>
  );
}
