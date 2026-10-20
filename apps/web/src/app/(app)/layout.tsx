import { Suspense, type ReactNode } from 'react';
import { AuthGate } from '@/features/auth/components/auth-gate';

/** Mọi trang trong `(app)` cần đăng nhập. F3 thêm khung sidebar server/channel vào đây. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="m-auto text-sm text-gray-500">Đang tải…</p>}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
