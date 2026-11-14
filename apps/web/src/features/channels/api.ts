import type {
  ChannelCategoryDto,
  ChannelDto,
  CreateCategoryInput,
  CreateChannelInput,
  MoveChannelInput,
  RenameCategoryInput,
  ReorderCategoriesInput,
  SetTopicInput,
  UpdateChannelInput,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export const listChannels = (serverId: string) =>
  api.get<ChannelDto[]>(`/servers/${serverId}/channels`);

export const createChannel = (serverId: string, input: CreateChannelInput) =>
  api.post<ChannelDto>(`/servers/${serverId}/channels`, input);

export const updateChannel = (channelId: string, input: UpdateChannelInput) =>
  api.patch<ChannelDto>(`/channels/${channelId}`, input);

export const deleteChannel = (channelId: string) =>
  api.delete<{ id: string }>(`/channels/${channelId}`);

export const moveChannel = (channelId: string, input: MoveChannelInput) =>
  api.put<ChannelDto>(`/channels/${channelId}/move`, input);

/** Chuỗi rỗng = xóa topic. */
export const setChannelTopic = (channelId: string, input: SetTopicInput) =>
  api.patch<ChannelDto>(`/channels/${channelId}/topic`, input);

export const createCategory = (serverId: string, input: CreateCategoryInput) =>
  api.post<ChannelCategoryDto>(`/servers/${serverId}/categories`, input);

export const renameCategory = (serverId: string, categoryId: string, input: RenameCategoryInput) =>
  api.patch<ChannelCategoryDto>(`/servers/${serverId}/categories/${categoryId}`, input);

export const deleteCategory = (serverId: string, categoryId: string) =>
  api.delete<{ id: string }>(`/servers/${serverId}/categories/${categoryId}`);

export const reorderCategories = (serverId: string, input: ReorderCategoriesInput) =>
  api.put<ChannelCategoryDto[]>(`/servers/${serverId}/categories/reorder`, input);
