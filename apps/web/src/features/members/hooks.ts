'use client';

import { ServerEvents, type PresenceUpdatedPayload } from '@ping/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useRealtime } from '@/features/realtime/context';
import type { RealtimeSession } from '@/features/realtime/session';
import { qk } from '@/lib/query-keys';
import { listMembers } from './api';
import { setPresence, type MembersCache } from './member-cache';
import { PresenceWatcher } from './presence-watch';

export function useMembers(serverId: string) {
  return useInfiniteQuery({
    queryKey: qk.members(serverId),
    queryFn: ({ pageParam }) => listMembers(serverId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.members.at(-1)?.id : undefined),
  });
}

const isMembersKey = (key: readonly unknown[]) => key[0] === 'servers' && key[2] === 'members';

/** Đăng ký presence của các thành viên đang hiển thị; hủy khi panel ẩn hoặc gỡ (ADR-0091). */
export function usePresenceWatch(serverId: string, userIds: string[]) {
  const session = useRealtime();
  const queryClient = useQueryClient();
  const watcher = useRef<PresenceWatcher | null>(null);
  const idsKey = userIds.join(',');

  useEffect(() => {
    const created = new PresenceWatcher(session.socket, serverId, (onlineIds) => {
      queryClient.setQueriesData<MembersCache>(
        { predicate: (query) => isMembersKey(query.queryKey) },
        (old) => onlineIds.reduce((cache, id) => setPresence(cache, id, true), old),
      );
    });
    watcher.current = created;
    return () => {
      created.dispose();
      watcher.current = null;
    };
  }, [session, serverId, queryClient]);

  useEffect(() => {
    watcher.current?.set(idsKey ? idsKey.split(',') : []);
  }, [session, serverId, idsKey]);
}

export function useMemberPresence(session: RealtimeSession) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const updated = ({ userId, status }: PresenceUpdatedPayload) => {
      queryClient.setQueriesData<MembersCache>(
        { predicate: (query) => isMembersKey(query.queryKey) },
        (old) => setPresence(old, userId, status === 'online'),
      );
    };
    let connectedBefore = false;
    const connected = () => {
      if (connectedBefore) {
        void queryClient.invalidateQueries({ predicate: (query) => isMembersKey(query.queryKey) });
      }
      connectedBefore = true;
    };
    session.socket.on(ServerEvents.PresenceUpdated, updated);
    session.socket.on('connect', connected);
    return () => {
      session.socket.off(ServerEvents.PresenceUpdated, updated);
      session.socket.off('connect', connected);
    };
  }, [session, queryClient]);
}
