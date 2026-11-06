'use client';

import type { DmListResponse, ServerUnreadDto } from '@ping/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '@/lib/query-keys';
import { drawFaviconBadge } from './favicon';
import { badgeTotal } from './notification-cache';

/**
 * Badge tiêu đề + favicon (TG.12): tổng unread mọi server (cache gộp `qk.unreadAll`, ADR-0077)
 * + tổng unread DM (cache `qk.dms`) → `(N) Ping`. Thay ngữ nghĩa cũ của `useUnreadTitle` (chỉ
 * tổng mention, T4.3) vì từ TG.12 mức 'all' cũng là thứ đáng kéo người dùng về tab. Favicon
 * được vẽ thêm chấm đỏ bằng canvas; n = 0 thì khôi phục icon gốc.
 */
export function useNotifyBadge(appName: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const update = () => {
      const servers = queryClient.getQueryData<ServerUnreadDto[]>(qk.unreadAll) ?? [];
      const rows = servers.map((server) => server.channels);
      const dms = queryClient.getQueryData<DmListResponse>(qk.dms);
      const total = badgeTotal(rows, dms);
      document.title = total > 0 ? `(${total}) ${appName}` : appName;
      drawFaviconBadge(total);
    };
    update();
    // TanStack trả về hàm unsubscribe trực tiếp (cùng mẫu với useUnreadTitle cũ).
    return queryClient.getQueryCache().subscribe(update);
  }, [appName, queryClient]);
}
