'use client';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { createServer, getServer, joinServer, leaveServer, listServers } from './api';

/** Chỉ dùng dưới AuthGate (đã giới hạn trong trình duyệt). */
export function useServers() {
  return useSuspenseQuery({ queryKey: qk.servers, queryFn: listServers });
}

export function useServer(serverId: string) {
  return useSuspenseQuery({ queryKey: qk.server(serverId), queryFn: () => getServer(serverId) });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createServer,
    onSuccess: (server) => {
      // Response đã đủ cho trang server: ghi thẳng vào cache, khỏi gọi GET lần nữa.
      queryClient.setQueryData(qk.server(server.id), server);
      queryClient.setQueryData(qk.channels(server.id), server.channels);
      return queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
    },
  });
}

export function useJoinServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: joinServer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.servers, exact: true }),
  });
}

export function useLeaveServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveServer,
    onSuccess: (_result, serverId) => {
      // Key xếp theo cây: xóa qk.server(id) là xóa luôn channels/members/permissions của nó.
      queryClient.removeQueries({ queryKey: qk.server(serverId) });
      return queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
    },
  });
}
