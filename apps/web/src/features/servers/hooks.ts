'use client';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import {
  ServerEvents,
  type MemberRemovedPayload,
  type PermissionsChangedPayload,
  type ChannelDto,
  type ServerSummary,
} from '@ping/shared';
import { useEffect, useEffectEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { RealtimeSession } from '@/features/realtime/session';
import { qk } from '@/lib/query-keys';
import { ApiError } from '@/lib/api-client';
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

export function useServerEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const onRemoved = useEffectEvent(async ({ serverId }: MemberRemovedPayload) => {
    const channels = new Set([
      ...session.channelsForServer(serverId),
      ...(queryClient.getQueryData<ChannelDto[]>(qk.channels(serverId)) ?? []).map((c) => c.id),
    ]);
    session.revoke(serverId);
    const belongs = (key: readonly unknown[]) =>
      (key[0] === 'servers' && key[1] === serverId) ||
      (key[0] === 'channels' && typeof key[1] === 'string' && channels.has(key[1]));
    await queryClient.cancelQueries({ predicate: (query) => belongs(query.queryKey) });
    if (!session.active) return;
    queryClient.removeQueries({ predicate: (query) => belongs(query.queryKey) });
    queryClient.setQueryData<ServerSummary[]>(qk.servers, (old) =>
      old?.filter((server) => server.id !== serverId),
    );
    if (pathname === `/servers/${serverId}` || pathname.startsWith(`/servers/${serverId}/`))
      router.replace('/');
    void queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
  });
  useEffect(() => {
    let listening = true;
    const removed = (event: MemberRemovedPayload) => void onRemoved(event);
    const permissions = (event: PermissionsChangedPayload) => {
      void queryClient.invalidateQueries({ queryKey: qk.server(event.serverId) });
      session.rejoin(event.serverId);
    };
    const connected = () => {
      // Personal events are not durable: REST detects kicks while offline.
      void queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
      for (const serverId of new Set(session.channelsForServerIds())) {
        void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
        void queryClient
          .fetchQuery({
            queryKey: qk.server(serverId),
            queryFn: () => getServer(serverId),
            staleTime: 0,
          })
          .catch((error: unknown) => {
            if (
              listening &&
              error instanceof ApiError &&
              (error.status === 403 || error.status === 404)
            )
              void onRemoved({ serverId });
          });
      }
    };
    session.socket.on(ServerEvents.MemberRemoved, removed);
    session.socket.on(ServerEvents.PermissionsChanged, permissions);
    session.socket.on('connect', connected);
    return () => {
      listening = false;
      session.socket.off(ServerEvents.MemberRemoved, removed);
      session.socket.off(ServerEvents.PermissionsChanged, permissions);
      session.socket.off('connect', connected);
    };
  }, [session, queryClient]);
}
