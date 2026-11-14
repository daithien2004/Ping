import { Suspense, type ReactNode } from 'react';
import { LocaleProvider } from '@/i18n/locale-provider';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

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
