import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { ChannelSidebar } from '@/features/channels/components/channel-sidebar';

export default function ServerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<aside className="w-60 bg-sidebar" />}>
        <ChannelSidebar />
      </Suspense>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </>
  );
}
