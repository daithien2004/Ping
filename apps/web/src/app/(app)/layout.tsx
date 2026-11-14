import { Suspense, type ReactNode } from 'react';
import { Providers } from '@/providers/providers';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { SettingsSync } from '@/features/settings/components/settings-sync';
import { AppShell } from '@/features/shell/components/app-shell';
import { RealtimeProvider } from '@/features/shell/components/realtime-provider';
import { ShellSkeleton } from '@/features/shell/components/shell-skeleton';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers fallback={<ShellSkeleton />}>
      <Suspense fallback={<ShellSkeleton />}>
        <AuthGate>
          <RealtimeProvider>
            <SettingsSync />
            <AppShell>{children}</AppShell>
          </RealtimeProvider>
        </AuthGate>
      </Suspense>
    </Providers>
  );
}
