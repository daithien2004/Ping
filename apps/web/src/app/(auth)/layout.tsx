import { Suspense, type ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Loading } from '@/components/loading';

/** Khung cho trang chưa đăng nhập. Form đọc phiên trong trình duyệt nên nằm trong Suspense. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center p-6">
      <LanguageSwitcher className="absolute top-4 left-4" />
      <Suspense fallback={<Loading className="text-sm text-muted-foreground" />}>
        {children}
      </Suspense>
    </main>
  );
}
