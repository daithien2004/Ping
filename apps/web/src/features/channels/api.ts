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

/** TG.10: di chuyển channel vào category (hoặc vùng mặc định với `categoryId: null`). */
export const moveChannel = (channelId: string, input: MoveChannelInput) =>
  api.put<ChannelDto>(`/channels/${channelId}/move`, input);

/** TG.10: chủ đề hiển thị ở header channel; chuỗi rỗng = xóa topic. */
export const setChannelTopic = (channelId: string, input: SetTopicInput) =>
  api.patch<ChannelDto>(`/channels/${channelId}/topic`, input);

/** TG.10: category ride along trong GET /servers/:id (hợp đồng trả nguyên trong detail). */
export const createCategory = (serverId: string, input: CreateCategoryInput) =>
  api.post<ChannelCategoryDto>(`/servers/${serverId}/categories`, input);

export const renameCategory = (serverId: string, categoryId: string, input: RenameCategoryInput) =>
  api.patch<ChannelCategoryDto>(`/servers/${serverId}/categories/${categoryId}`, input);

export const deleteCategory = (serverId: string, categoryId: string) =>
  api.delete<{ id: string }>(`/servers/${serverId}/categories/${categoryId}`);

/** Sắp lại toàn bộ category theo mảng id; API trả về danh sách mới (position đã gán). */
export const reorderCategories = (serverId: string, input: ReorderCategoriesInput) =>
  api.put<ChannelCategoryDto[]>(`/servers/${serverId}/categories/reorder`, input);
