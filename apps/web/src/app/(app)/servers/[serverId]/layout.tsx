import { Suspense, type ReactNode } from 'react';
import { ChannelSidebar } from '@/features/channels/components/channel-sidebar';

export default function ServerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<aside className="w-60 bg-gray-100 dark:bg-gray-800" />}>
        <ChannelSidebar />
      </Suspense>
      <Suspense fallback={<p className="m-auto text-sm text-gray-500">Đang tải…</p>}>
        {children}
      </Suspense>
    </>
  );
}
