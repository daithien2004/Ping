import type {
  CreateMessageInput,
  MessageDto,
  MessagePage,
  MessagePinResult,
  MessageReactionSummary,
  PinnedMessageDto,
  ReactionUsersPage,
  UpdateMessageInput,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export const listMessages = (channelId: string, before?: string) =>
  api.get<MessagePage>(
    `/channels/${channelId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  );

export const listMessagesAfter = (channelId: string, after: string) =>
  api.get<MessagePage>(`/channels/${channelId}/messages?after=${encodeURIComponent(after)}`);

export const listMessagesAround = (channelId: string, around: string, limit = 50) =>
  api.get<MessagePage>(
    `/channels/${channelId}/messages?around=${encodeURIComponent(around)}&limit=${limit}`,
  );

export const sendMessage = (channelId: string, input: CreateMessageInput) =>
  api.post<MessageDto>(`/channels/${channelId}/messages`, input);

export const editMessageRequest = (id: string, input: UpdateMessageInput) =>
  api.patch<MessageDto>(`/messages/${id}`, input);
export const deleteMessageRequest = (id: string) => api.delete<{ id: string }>(`/messages/${id}`);

export const addReactionRequest = (messageId: string, emoji: string) =>
  api.put<MessageReactionSummary>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
export const removeReactionRequest = (messageId: string, emoji: string) =>
  api.delete<MessageReactionSummary>(
    `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
  );

export const listReactionUsers = (messageId: string, emoji: string, after?: string) =>
  api.get<ReactionUsersPage>(
    `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}${
      after ? `?after=${encodeURIComponent(after)}` : ''
    }`,
  );

export const pinMessage = (messageId: string) =>
  api.put<MessagePinResult>(`/messages/${messageId}/pin`);
export const unpinMessage = (messageId: string) =>
  api.delete<MessagePinResult>(`/messages/${messageId}/pin`);
export const listPins = (channelId: string) =>
  api.get<PinnedMessageDto[]>(`/channels/${channelId}/pins`);
