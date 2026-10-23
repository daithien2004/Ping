import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from '@ping/shared';
import { api } from '@/lib/api-client';

export const listChannels = (serverId: string) =>
  api.get<ChannelDto[]>(`/servers/${serverId}/channels`);

export const createChannel = (serverId: string, input: CreateChannelInput) =>
  api.post<ChannelDto>(`/servers/${serverId}/channels`, input);

export const updateChannel = (channelId: string, input: UpdateChannelInput) =>
  api.patch<ChannelDto>(`/channels/${channelId}`, input);

export const deleteChannel = (channelId: string) =>
  api.delete<{ id: string }>(`/channels/${channelId}`);
