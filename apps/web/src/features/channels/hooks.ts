'use client';

import type {
  ChannelCreatedPayload,
  ChannelDeletedPayload,
  ChannelDto,
  ChannelUpdatedPayload,
  CreateChannelInput,
  UpdateChannelInput,
} from '@ping/shared';
import { ServerEvents } from '@ping/shared';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useEffectEvent } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import { qk } from '@/lib/query-keys';
import { createChannel, deleteChannel, listChannels, updateChannel } from './api';

export function useChannels(serverId: string) {
  return useSuspenseQuery({
    queryKey: qk.channels(serverId),
    queryFn: () => listChannels(serverId),
  });
}

/** Giữ thứ tự như server trả về (position tăng dần). */
function upsertChannel(channels: ChannelDto[], channel: ChannelDto): ChannelDto[] {
  const exists = channels.some((item) => item.id === channel.id);
  const next = exists
    ? channels.map((item) => (item.id === channel.id ? channel : item))
    : [...channels, channel];
  return next.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function useCreateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) => createChannel(serverId, input),
    // Event realtime có thể tới trước response; upsert để không chèn trùng.
    onSuccess: (channel) =>
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? upsertChannel(old, channel) : old,
      ),
  });
}

export function useUpdateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, input }: { channelId: string; input: UpdateChannelInput }) =>
      updateChannel(channelId, input),
    onSuccess: (channel) =>
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? upsertChannel(old, channel) : old,
      ),
  });
}

export function useDeleteChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => deleteChannel(channelId),
    onSuccess: (_result, channelId) => {
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old?.filter((channel) => channel.id !== channelId),
      );
      queryClient.removeQueries({ queryKey: qk.messages(channelId), exact: true });
    },
  });
}

/**
 * UPDATE realtime cho danh sách channel. Chỉ ghi cache khi danh sách đã có dữ liệu:
 * event chỉ chở một channel nên không được biến cache thành danh sách thiếu.
 */
export function useChannelEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const onUpsert = useEffectEvent((channel: ChannelCreatedPayload | ChannelUpdatedPayload) => {
    queryClient.setQueryData<ChannelDto[]>(qk.channels(channel.serverId), (old) =>
      old ? upsertChannel(old, channel) : old,
    );
  });

  const onDeleted = useEffectEvent((event: ChannelDeletedPayload) => {
    queryClient.setQueryData<ChannelDto[]>(qk.channels(event.serverId), (old) =>
      old?.filter((channel) => channel.id !== event.id),
    );
    queryClient.removeQueries({ queryKey: qk.messages(event.id), exact: true });
    // Đang xem đúng channel bị xóa: về trang server để chuyển sang channel còn lại.
    if (pathname === `/servers/${event.serverId}/channels/${event.id}`) {
      router.replace(`/servers/${event.serverId}`);
    }
  });

  useEffect(() => {
    const created = (event: ChannelCreatedPayload) => onUpsert(event);
    const updated = (event: ChannelUpdatedPayload) => onUpsert(event);
    const deleted = (event: ChannelDeletedPayload) => onDeleted(event);
    session.socket.on(ServerEvents.ChannelCreated, created);
    session.socket.on(ServerEvents.ChannelUpdated, updated);
    session.socket.on(ServerEvents.ChannelDeleted, deleted);
    return () => {
      session.socket.off(ServerEvents.ChannelCreated, created);
      session.socket.off(ServerEvents.ChannelUpdated, updated);
      session.socket.off(ServerEvents.ChannelDeleted, deleted);
    };
  }, [session]);
}
