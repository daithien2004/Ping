import type { ReactNode } from 'react';
import { Providers } from '@/providers/providers';

/** Khung trang công khai (landing): nền app, không có rail của app. Nút đổi ngôn ngữ nằm ở thanh trên của trang. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="relative flex min-h-dvh flex-col">{children}</div>
    </Providers>
  );
}
