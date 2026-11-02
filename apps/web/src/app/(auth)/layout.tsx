import { Suspense, type ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Loading } from '@/components/loading';

/** Khung cho trang chưa đăng nhập. Form đọc phiên trong trình duyệt nên nằm trong Suspense. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Discord: nền thương hiệu phủ kín màn hình, thẻ trắng ở giữa cho form. `min-h-dvh` vì
    // antd App bọc thêm một div cao theo nội dung, nên `flex-1` của body không kéo tới đáy.
    <main className="relative flex min-h-dvh flex-1 items-center justify-center bg-primary p-6">
      <LanguageSwitcher className="absolute top-4 left-4" />
      <div className="w-full max-w-md rounded-md bg-card p-8 text-card-foreground shadow-panel">
        <div className="flex justify-center">
          <Suspense fallback={<Loading className="text-sm text-muted-foreground" />}>
            {children}
          </Suspense>
        </div>
      </div>
    </main>
  );
}
