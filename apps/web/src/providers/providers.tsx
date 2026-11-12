import { Suspense, type ReactNode } from 'react';
import { LocaleProvider } from '@/i18n/locale-provider';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

/**
 * Mọi provider dùng chung của app. Gắn ở layout từng nhóm route (không gắn ở root) để nhóm tự
 * chọn `fallback` cho lúc `LocaleProvider` còn treo: nhóm app vẽ khung, nhóm công khai để trống.
 * Nhờ vậy HTML tĩnh của nhóm app đã có khung — F5 không còn màn trắng chờ JS.
 */
export function Providers({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <LocaleProvider>
        <QueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryProvider>
      </LocaleProvider>
    </Suspense>
  );
}
