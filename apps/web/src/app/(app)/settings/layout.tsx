import type { ReactNode } from 'react';
import { SettingsNav } from '@/features/settings/components/settings-nav';

/** Trang cài đặt cá nhân (TG.13): nav mục bên trái + nội dung mục bên phải. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <SettingsNav />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
