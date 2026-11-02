'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { PingSkeleton } from '@/components/ui/ping-skeleton';

/** Vùng đang tải: trình đọc màn hình đọc nhãn, người nhìn thấy khung xương thay cho khối trống. */
function Busy({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** Thay cho cột server lúc đang tải danh sách server. */
export function RailSkeleton() {
  const t = useTranslations('servers');
  return (
    <Busy
      label={t('loading')}
      className="flex w-18 shrink-0 flex-col items-center gap-2 bg-rail py-3"
    >
      {[0, 1, 2].map((index) => (
        <PingSkeleton block key={index} className="size-10 rounded-full bg-background/60" />
      ))}
    </Busy>
  );
}

/** Thay cho cột channel lúc đang tải server và danh sách channel. */
export function SidebarSkeleton() {
  const t = useTranslations('channels');
  return (
    <Busy label={t('loading')} className="flex w-sidebar shrink-0 flex-col gap-2 bg-sidebar p-3">
      <PingSkeleton block className="h-10 w-full" />
      {[0, 1, 2, 3].map((index) => (
        <PingSkeleton block key={index} className="h-7 w-full" />
      ))}
    </Busy>
  );
}

/**
 * Thay cho danh sách tin nhắn lúc đang tải trang đầu. Ba khối có hình dạng giống tin thật
 * (tên ngắn + 1–2 dòng nội dung, khối cuối sát đáy) để lúc dữ liệu về không nhảy chiều cao.
 */
export function MessageListSkeleton() {
  const t = useTranslations('messages');
  const blocks = [
    { header: 'w-32', lines: ['w-3/4', 'w-1/2'] },
    { header: 'w-24', lines: ['w-full'] },
    { header: 'w-40', lines: ['w-2/3', 'w-1/3'] },
  ];
  return (
    <Busy label={t('loading')} className="flex min-h-0 flex-1 flex-col justify-end gap-3 p-4">
      {blocks.map((block) => (
        <div key={block.header} className="flex flex-col gap-2">
          <PingSkeleton block className={`h-4 ${block.header}`} />
          {block.lines.map((width) => (
            <PingSkeleton block key={width} className={`h-4 ${width}`} />
          ))}
        </div>
      ))}
    </Busy>
  );
}
