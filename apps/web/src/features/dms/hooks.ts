'use client';

import {
  ServerEvents,
  type ChannelActivityPayload,
  type DmListResponse,
  type ReadUpdatedPayload,
  type UpdatePrivacyInput,
  type UserPrivacyDto,
} from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import { qk } from '@/lib/query-keys';
import { blockUser, createDm, getPrivacy, listDms, unblockUser, updatePrivacy } from './api';
import { applyDmActivity, applyDmRead } from './dm-cache';
import { useDmBlockStore } from './store';

/**
 * Danh sách DM của người gọi (TG.9, mục 7 của ADR-0070). staleTime ngắn: badge chưa đọc là
 * tín hiệu cần tươi, còn realtime giữa hai lần refetch do `useDmEvents` cập nhật tinh.
 * `select` tách mảng để nơi dùng không đụng vỏ response (selector ổn định nên không render lại thừa).
 */
const selectDms = (data: DmListResponse) => data.dms;

export function useDms() {
  return useQuery({
    queryKey: qk.dms,
    queryFn: listDms,
    staleTime: 10_000,
    select: selectDms,
  });
}

export function useCreateDm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => createDm({ userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.dms, exact: true });
    },
  });
}

export function useToggleBlock() {
  const queryClient = useQueryClient();
  const setBlocked = useDmBlockStore((state) => state.setBlocked);
  return useMutation({
    mutationFn: ({ userId, block }: { userId: string; block: boolean }) =>
      block ? blockUser(userId) : unblockUser(userId),
    onSuccess: (_result, { userId, block }) => {
      setBlocked(userId, block);
      void queryClient.invalidateQueries({ queryKey: qk.blockedUsers });
    },
  });
}

export function usePrivacy() {
  return useQuery({ queryKey: qk.privacy, queryFn: getPrivacy, staleTime: Infinity });
}

export function useUpdatePrivacy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePrivacyInput) => updatePrivacy(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.privacy });
      const previous = queryClient.getQueryData<UserPrivacyDto>(qk.privacy);
      queryClient.setQueryData<UserPrivacyDto>(qk.privacy, { dmAllow: input.dmAllow });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk.privacy, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.privacy });
    },
  });
}

/**
 * Sự kiện realtime cho badge DM (mục 6-7 của ADR-0070): tin DM phát `channel.activity` với
 * `serverId: null` qua room `user:<id>` (emitToUser best-effort) — tăng badge tinh, không
 * reload; tin channel server vẫn do `useUnreadEvents` lo. `read.updated` của chính mình
 * (mark-read tái dùng PUT /channels/:id/read) đưa badge DM về 0 ở mọi tab.
 */
export function useDmEvents(session: RealtimeSession, userId: string, activeChannelId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const activity = (event: ChannelActivityPayload) => {
      if (event.serverId !== null) return;
      if (event.authorId === userId) return;
      if (event.channelId === activeChannelId) return;
      queryClient.setQueryData<DmListResponse>(qk.dms, (old) =>
        old ? { dms: applyDmActivity(old.dms, event.channelId) } : old,
      );
    };
    const read = (event: ReadUpdatedPayload) => {
      queryClient.setQueryData<DmListResponse>(qk.dms, (old) =>
        old ? { dms: applyDmRead(old.dms, event.channelId, event.lastReadMessageId) } : old,
      );
    };
    const connected = () => {
      void queryClient.invalidateQueries({ queryKey: qk.dms, exact: true });
    };
    session.socket.on(ServerEvents.ChannelActivity, activity);
    session.socket.on(ServerEvents.ReadUpdated, read);
    session.socket.on('connect', connected);
    return () => {
      session.socket.off(ServerEvents.ChannelActivity, activity);
      session.socket.off(ServerEvents.ReadUpdated, read);
      session.socket.off('connect', connected);
    };
  }, [session, userId, activeChannelId, queryClient]);
}
