'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Skeleton } from '@/components/ui/skeleton';

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
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3"
    >
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="size-12 rounded-3xl bg-background/60" />
      ))}
    </Busy>
  );
}

/** Thay cho cột channel lúc đang tải server và danh sách channel. */
export function SidebarSkeleton() {
  const t = useTranslations('channels');
  return (
    <Busy label={t('loading')} className="flex w-60 shrink-0 flex-col gap-2 bg-sidebar p-3">
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-7 w-full" />
      ))}
    </Busy>
  );
}

/** Thay cho danh sách tin nhắn lúc đang tải trang đầu. */
export function MessageListSkeleton() {
  const t = useTranslations('messages');
  return (
    <Busy label={t('loading')} className="flex min-h-0 flex-1 flex-col justify-end gap-5 p-4">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className={`h-4 ${index % 2 ? 'w-2/3' : 'w-full'}`} />
        </div>
      ))}
    </Busy>
  );
}
