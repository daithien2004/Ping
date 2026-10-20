import { Suspense, type ReactNode } from 'react';

/** Khung cho trang chưa đăng nhập. Form đọc phiên trong trình duyệt nên nằm trong Suspense. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<p className="text-sm text-gray-500">Đang tải…</p>}>{children}</Suspense>
    </main>
  );
}
