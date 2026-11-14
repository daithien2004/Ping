import type { ReactNode } from 'react';
import { SettingsNav } from '@/features/settings/components/settings-nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <SettingsNav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">{children}</div>
    </div>
  );
}
