'use client';

import { Suspense, type ReactNode } from 'react';
import { LocaleProvider } from '@/i18n/locale-provider';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

/** Moi provider dung chung cua app, gan mot lan o root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LocaleProvider>
        <QueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryProvider>
      </LocaleProvider>
    </Suspense>
  );
}
