import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';

/** Khung trang công khai (landing): nền app + nút đổi ngôn ngữ, không có rail của app. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <LanguageSwitcher className="absolute top-4 right-4" />
      {children}
    </div>
  );
}
