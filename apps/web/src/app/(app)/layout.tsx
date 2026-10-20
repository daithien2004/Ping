import { Suspense, type ReactNode } from 'react';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { ServerRail } from '@/features/servers/components/server-rail';

const loading = <p className="m-auto text-sm text-gray-500">Đang tải…</p>;

/**
 * Khung của mọi trang cần đăng nhập: cột server bên trái + nội dung. Mỗi vùng có Suspense riêng:
 * vùng nội dung đang tải thì cột server vẫn bấm được (không trắng cả màn hình).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={loading}>
      <AuthGate>
        <div className="flex h-dvh">
          <Suspense fallback={<div className="w-[72px] bg-gray-900" />}>
            <ServerRail />
          </Suspense>
          <div className="flex min-w-0 flex-1">
            <Suspense fallback={loading}>{children}</Suspense>
          </div>
        </div>
      </AuthGate>
    </Suspense>
  );
}
