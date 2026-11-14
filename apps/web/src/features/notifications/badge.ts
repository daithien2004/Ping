'use client';

import type { DmListResponse, ServerUnreadDto } from '@ping/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '@/lib/query-keys';
import { drawFaviconBadge } from './favicon';
import { badgeTotal } from './notification-cache';

export function useNotifyBadge(appName: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let lastTotal: number | null = null;
    const update = () => {
      const servers = queryClient.getQueryData<ServerUnreadDto[]>(qk.unreadAll) ?? [];
      const rows = servers.map((server) => server.channels);
      const dms = queryClient.getQueryData<DmListResponse>(qk.dms);
      const total = badgeTotal(rows, dms);
      if (total === lastTotal) return;
      lastTotal = total;
      document.title = total > 0 ? `(${total}) ${appName}` : appName;
      drawFaviconBadge(total);
    };
    update();
    return queryClient.getQueryCache().subscribe(update);
  }, [appName, queryClient]);
}
