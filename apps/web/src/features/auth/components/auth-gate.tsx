'use client';

import { usePathname, useRouter } from 'next/navigation';
import { use, useEffect, type ReactNode } from 'react';
import { browser } from 'react-dom';
import { useMe, useSessionExpiry } from '../hooks';
import { loginRedirectPath } from '../session';

/**
 * Bọc mọi trang cần đăng nhập (route group `(app)`). Là nơi DUY NHẤT gọi `use(browser())`
 * cho khu vực này: mọi component con mặc nhiên chỉ render trong trình duyệt (ADR-0017),
 * không phải lặp lại ở từng component gọi API.
 *
 * Không dùng proxy.ts để chặn route: cookie refresh thuộc API, web server không thấy (ADR-0015).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  use(browser('Phiên đăng nhập chỉ tồn tại trong trình duyệt.'));
  const { data: me } = useMe();
  useSessionExpiry();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!me) {
      router.replace(loginRedirectPath(pathname));
    }
  }, [me, router, pathname]);

  return me ? children : null;
}
