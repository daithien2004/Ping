'use client';

import type { ReactNode } from 'react';
import { z } from 'zod';
import { QueryProvider } from './query-provider';

// Thông báo lỗi validate (schema từ @ping/shared) bằng tiếng Việt cho toàn bộ web.
z.config(z.locales.vi());

/** Mọi provider dùng chung của app, gắn một lần ở root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
