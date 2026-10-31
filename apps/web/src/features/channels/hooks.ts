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

/** TG.10: category trả nguyên trong GET /servers/:id (không có GET riêng) — đọc từ cache. */
export function useCategories(serverId: string): ChannelCategoryDto[] {
  const { data: server } = useServer(serverId);
  return server.categories ?? [];
}

/** Giữ thứ tự như server trả về (position tăng dần). */
function upsertChannel(channels: ChannelDto[], channel: ChannelDto): ChannelDto[] {
  const exists = channels.some((item) => item.id === channel.id);
  const next = exists
    ? channels.map((item) => (item.id === channel.id ? channel : item))
    : [...channels, channel];
  return next.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Ghi danh sách category vào cache chi tiết server (nguồn duy nhất của sidebar). */
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
 * TG.10: kéo thả/bàn phím di chuyển channel. Optimistic: đặt nhóm + positionKey đã tính
 * ngay để sidebar nhảy theo tay kéo; response trả channel với rank thật của server rồi
 * event `channel.reordered` chốt thứ tự cả nhóm. Refetch nền sau cùng để positionKey của
 * CẢ NHÓM khớp server (server có thể rebalance khi cạn khoảng).
 */
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

/**
 * TG.10: đổi thứ tự channel trong vùng mặc định (PATCH position từng kênh đổi chỗ) —
 * hợp đồng move không nhận positionKey cho vùng này.
 */
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
    // API tái dùng event channel.updated (payload có topic) cho tab khác; ở tab này
    // response đã đủ để cập nhật header ngay.
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
      // Response mang position thật (server đã gán) — chèn vào cache theo sort;
      // event scope 'categories' tới sau chỉ chốt lại thứ tự id.
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
    // API không phát event cho đổi tên (trường hiển thị) — tab khác thấy qua refetch detail.
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
      // Kênh trong category bị xóa trở về vùng mặc định, giữ position Int cũ (khớp API).
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

/** TG.10: sắp lại thứ tự category — optimistic theo mảng id, response là danh sách mới. */
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

  /**
   * TG.10: `channel.reordered` — scope 'category' chốt lại thứ tự kênh của MỘT nhóm theo
   * channelIds; scope 'categories' mang các **categoryId** theo thứ tự mới (cả CREATE/DELETE
   * category cũng phát scope này). Sau khi vá cache luôn refetch nền: positionKey/position
   * trong event là thứ tự, không phải rank thật của server.
   */
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
    // Refetch nền để rank thật của server về cache (event chỉ mang thứ tự); `exact` để
    // không lôi cả members/roles/unread của server vào mỗi lần kéo thả.
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
