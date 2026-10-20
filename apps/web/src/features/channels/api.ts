import type { ChannelDto, CreateChannelInput } from '@ping/shared';
import { api } from '@/lib/api-client';

export const listChannels = (serverId: string) =>
  api.get<ChannelDto[]>(`/servers/${serverId}/channels`);

export const createChannel = (serverId: string, input: CreateChannelInput) =>
  api.post<ChannelDto>(`/servers/${serverId}/channels`, input);
