import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { SidebarSkeleton } from '@/features/channels/components/sidebar-skeleton';
import { DmSidebar } from '@/features/dms/components/dm-sidebar';

export default function DmsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<SidebarSkeleton />}>
        <DmSidebar />
      </Suspense>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </>
  );
}
