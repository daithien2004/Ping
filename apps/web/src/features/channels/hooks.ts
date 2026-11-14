'use client';

import type {
  ChannelCategoryDto,
  ChannelCreatedPayload,
  ChannelDeletedPayload,
  ChannelDto,
  ChannelReorderedPayload,
  ChannelUpdatedPayload,
  CreateChannelInput,
  MoveChannelInput,
  ServerDetail,
  UpdateChannelInput,
} from '@ping/shared';
import { ServerEvents } from '@ping/shared';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useEffectEvent } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import { useServer } from '@/features/servers/hooks';
import { serverPath } from '@/features/servers/navigation';
import { channelIdFromPath, serverIdFromPath } from '@/lib/channel-url';
import { qk } from '@/lib/query-keys';
import { createChannel, deleteChannel, listChannels, updateChannel } from './api';
import {
  createCategory,
  deleteCategory,
  moveChannel,
  renameCategory,
  reorderCategories,
  setChannelTopic,
} from './api';
import {
  applyCategoryOrder,
  applyChannelMove,
  applyChannelOrder,
  applyPositionUpdates,
  sortCategories,
} from './sidebar-model';

export function useChannels(serverId: string) {
  return useSuspenseQuery({
    queryKey: qk.channels(serverId),
    queryFn: () => listChannels(serverId),
  });
}

export function useCategories(serverId: string): ChannelCategoryDto[] {
  const { data: server } = useServer(serverId);
  return server.categories ?? [];
}

function upsertChannel(channels: ChannelDto[], channel: ChannelDto): ChannelDto[] {
  const exists = channels.some((item) => item.id === channel.id);
  const next = exists
    ? channels.map((item) => (item.id === channel.id ? channel : item))
    : [...channels, channel];
  return next.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

function setCategories(
  queryClient: ReturnType<typeof useQueryClient>,
  serverId: string,
  update: (categories: ChannelCategoryDto[]) => ChannelCategoryDto[],
) {
  queryClient.setQueryData<ServerDetail>(qk.server(serverId), (old) =>
    old ? { ...old, categories: update(old.categories ?? []) } : old,
  );
}

export function useCreateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) => createChannel(serverId, input),
    // Event realtime có thể tới trước response; upsert để không chèn trùng.
    onSuccess: (channel) => {
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? upsertChannel(old, channel) : old,
      );
      void queryClient.invalidateQueries({ queryKey: qk.unreadAll });
    },
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
      void queryClient.invalidateQueries({ queryKey: qk.unreadAll });
    },
  });
}

export function useMoveChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, input }: { channelId: string; input: MoveChannelInput }) =>
      moveChannel(channelId, input),
    onMutate: ({ channelId, input }) => {
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? applyChannelMove(old, channelId, input.categoryId, input.positionKey ?? null) : old,
      );
    },
    onSuccess: (channel) =>
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? upsertChannel(old, channel) : old,
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.channels(serverId) }),
  });
}

export function useUpdateChannelPositions(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Array<{ channelId: string; position: number }>) => {
      let last: ChannelDto | undefined;
      for (const update of updates) {
        last = await updateChannel(update.channelId, { position: update.position });
      }
      return last;
    },
    onMutate: (updates) => {
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? applyPositionUpdates(old, updates) : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.channels(serverId) }),
  });
}

export function useSetChannelTopic(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, topic }: { channelId: string; topic: string }) =>
      setChannelTopic(channelId, { topic }),
    onSuccess: (channel) =>
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old ? upsertChannel(old, channel) : old,
      ),
  });
}

export function useCreateCategory(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => createCategory(serverId, input),
    onSuccess: (category) => {
      setCategories(queryClient, serverId, (categories) =>
        sortCategories([...categories, category]),
      );
    },
  });
}

export function useRenameCategory(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      renameCategory(serverId, categoryId, { name }),
    onSuccess: (category) =>
      setCategories(queryClient, serverId, (categories) =>
        categories.map((item) => (item.id === category.id ? category : item)),
      ),
  });
}

export function useDeleteCategory(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(serverId, categoryId),
    onSuccess: (_result, categoryId) => {
      setCategories(queryClient, serverId, (categories) =>
        categories.filter((item) => item.id !== categoryId),
      );
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old) =>
        old?.map((channel) =>
          channel.categoryId === categoryId
            ? { ...channel, categoryId: null, positionKey: null }
            : channel,
        ),
      );
    },
  });
}

export function useReorderCategories(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderCategories(serverId, { orderedIds }),
    onMutate: (orderedIds) => {
      setCategories(queryClient, serverId, (categories) =>
        applyCategoryOrder(categories, orderedIds),
      );
    },
    onSuccess: (categories) => {
      setCategories(queryClient, serverId, () => categories);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
    },
  });
}

/** Chỉ ghi cache khi danh sách đã có dữ liệu: event chỉ chở một channel. */
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
    if (serverIdFromPath(pathname) === event.serverId && channelIdFromPath(pathname) === event.id) {
      router.replace(serverPath(event.serverId));
    }
  });

  /** Sau khi vá cache luôn refetch nền: positionKey/position trong event là thứ tự, không phải rank thật. */
  const onReordered = useEffectEvent((payload: ChannelReorderedPayload) => {
    if (payload.scope === 'categories') {
      setCategories(queryClient, payload.serverId, (categories) =>
        applyCategoryOrder(categories, payload.channelIds),
      );
    } else {
      queryClient.setQueryData<ChannelDto[]>(qk.channels(payload.serverId), (old) =>
        old ? applyChannelOrder(old, payload.categoryId ?? null, payload.channelIds) : old,
      );
    }
    // Refetch nền lấy rank thật; `exact` để không kéo cả members/roles/unread.
    void queryClient.invalidateQueries({
      queryKey: qk.channels(payload.serverId),
    });
    if (payload.scope === 'categories') {
      void queryClient.invalidateQueries({ queryKey: qk.server(payload.serverId), exact: true });
    }
  });

  useEffect(() => {
    const created = (event: ChannelCreatedPayload) => onUpsert(event);
    const updated = (event: ChannelUpdatedPayload) => onUpsert(event);
    const deleted = (event: ChannelDeletedPayload) => onDeleted(event);
    const reordered = (event: ChannelReorderedPayload) => onReordered(event);
    session.socket.on(ServerEvents.ChannelCreated, created);
    session.socket.on(ServerEvents.ChannelUpdated, updated);
    session.socket.on(ServerEvents.ChannelDeleted, deleted);
    session.socket.on(ServerEvents.ChannelReordered, reordered);
    return () => {
      session.socket.off(ServerEvents.ChannelCreated, created);
      session.socket.off(ServerEvents.ChannelUpdated, updated);
      session.socket.off(ServerEvents.ChannelDeleted, deleted);
      session.socket.off(ServerEvents.ChannelReordered, reordered);
    };
  }, [session]);
}
