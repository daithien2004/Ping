import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { RailSkeleton } from '@/components/skeletons';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { ServerRail } from '@/features/servers/components/server-rail';
import { RealtimeProvider } from '@/features/realtime/components/realtime-provider';
import { ConnectionBanner } from '@/features/realtime/components/connection-banner';
import { QuickSwitcher } from '@/components/quick-switcher';

/**
 * Khung của mọi trang cần đăng nhập: cột server bên trái + nội dung. Mỗi vùng có Suspense riêng:
 * vùng nội dung đang tải thì cột server vẫn bấm được (không trắng cả màn hình).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthGate>
        <RealtimeProvider>
          <div className="flex h-dvh flex-col">
            <ConnectionBanner />
            <QuickSwitcher items={[]} />
            <div className="flex min-h-0 min-w-[960px] flex-1">
              <Suspense fallback={<RailSkeleton />}>
                <ServerRail />
              </Suspense>
              <div className="flex min-w-0 flex-1">
                <Suspense fallback={<Loading />}>{children}</Suspense>
              </div>
            </div>
          </div>
        </RealtimeProvider>
      </AuthGate>
    </Suspense>
  );
}
