'use client';

import type { ChannelDto, CreateChannelInput } from '@ping/shared';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { createChannel, listChannels } from './api';

export function useChannels(serverId: string) {
  return useSuspenseQuery({
    queryKey: qk.channels(serverId),
    queryFn: () => listChannels(serverId),
  });
}

export function useCreateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) => createChannel(serverId, input),
    onSuccess: (channel) =>
      // Thêm channel mới vào cuối danh sách đang có (server trả position = max + 1).
      queryClient.setQueryData<ChannelDto[]>(qk.channels(serverId), (old = []) => [
        ...old,
        channel,
      ]),
  });
}
