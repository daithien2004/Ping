import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { ServerRail } from '@/features/servers/components/server-rail';

/**
 * Khung của mọi trang cần đăng nhập: cột server bên trái + nội dung. Mỗi vùng có Suspense riêng:
 * vùng nội dung đang tải thì cột server vẫn bấm được (không trắng cả màn hình).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthGate>
        <div className="flex h-dvh min-w-[960px]">
          <Suspense fallback={<div className="w-[72px] bg-rail" />}>
            <ServerRail />
          </Suspense>
          <div className="flex min-w-0 flex-1">
            <Suspense fallback={<Loading />}>{children}</Suspense>
          </div>
        </div>
      </AuthGate>
    </Suspense>
  );
}
