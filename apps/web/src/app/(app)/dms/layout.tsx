import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { SidebarSkeleton } from '@/components/skeletons';
import { DmSidebar } from '@/features/dms/components/dm-sidebar';

/**
 * Khung vùng DM (TG.9): cột hội thoại bên trái + nội dung, đối xứng với layout của server.
 * Cột hội thoại dùng cache `qk.dms` nên vào thẳng permalink vẫn hiện danh sách ngay.
 */
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
