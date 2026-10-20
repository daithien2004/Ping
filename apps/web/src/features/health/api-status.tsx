'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { use } from 'react';
import { browser } from 'react-dom';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

/**
 * Tạm thời cho F1 (F2 thay bằng luồng đăng nhập): chứng minh provider, api-client, CORS
 * từ :3000 sang :4000 và env đều chạy trong trình duyệt thật. Nằm trong <Suspense>.
 *
 * `use(browser())`: chỉ gọi API trong trình duyệt. Không có nó, useSuspenseQuery chạy cả lúc
 * Next render trên server — nơi không có access token lẫn cookie của người dùng (ADR-0017).
 */
export function ApiStatus() {
  use(browser('Gọi API bằng phiên đăng nhập của trình duyệt.'));
  const { data } = useSuspenseQuery({
    queryKey: qk.health,
    queryFn: () => api.get<{ status: string }>('/health'),
  });
  return <p className="text-sm text-green-600">API: {data.status}</p>;
}
