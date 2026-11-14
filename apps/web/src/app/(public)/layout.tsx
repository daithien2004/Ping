import type { ReactNode } from 'react';
import { Providers } from '@/providers/providers';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="relative flex min-h-dvh flex-col">{children}</div>
    </Providers>
  );
}
