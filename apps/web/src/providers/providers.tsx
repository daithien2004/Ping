'use client';

import { Suspense, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LocaleProvider } from '@/i18n/locale-provider';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

/** Moi provider dung chung cua app, gan mot lan o root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LocaleProvider>
        <QueryProvider>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </LocaleProvider>
    </Suspense>
  );
}
