import { Suspense, type ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Loading } from '@/components/loading';
import { Providers } from '@/providers/providers';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
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
    </Providers>
  );
}
