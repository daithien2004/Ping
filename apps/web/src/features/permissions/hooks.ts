'use client';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { getServerPermissions } from './api';

export const permissionQuery = (serverId: string) =>
  queryOptions({
    queryKey: qk.permissions(serverId),
    queryFn: () => getServerPermissions(serverId),
    staleTime: 30_000,
  });

export function useServerPermissions(serverId: string) {
  return useQuery(permissionQuery(serverId));
}
