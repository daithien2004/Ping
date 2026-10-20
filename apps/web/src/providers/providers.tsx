'use client';

import { Suspense, type ReactNode } from 'react';
import { LocaleProvider } from '@/i18n/locale-provider';
import { QueryProvider } from './query-provider';

/** Mọi provider dùng chung của app, gắn một lần ở root layout. */
export function Providers({ children }: { children: ReactNode }) {
  // LocaleProvider chỉ chạy trong trình duyệt (đọc cookie): khi prerender nó treo, fallback rỗng.
  // Mọi chữ của app vì vậy chỉ render ở client, cùng một ngôn ngữ, không lệch khi hydrate.
  return (
    <Suspense fallback={null}>
      <LocaleProvider>
        <QueryProvider>{children}</QueryProvider>
      </LocaleProvider>
    </Suspense>
  );
}
