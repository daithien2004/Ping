import {
  createCustomEmojiSchema,
  type CreateCustomEmojiInput,
  type CustomEmojiDto,
  type CustomEmojiListResponse,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export function listEmojis(serverId: string): Promise<CustomEmojiListResponse> {
  return api.get<CustomEmojiListResponse>(`/servers/${serverId}/emojis`);
}

export function createEmoji(
  serverId: string,
  input: CreateCustomEmojiInput,
): Promise<CustomEmojiDto> {
  const parsed = createCustomEmojiSchema.parse(input);
  return api.post<CustomEmojiDto>(`/servers/${serverId}/emojis`, parsed);
}

export function deleteEmoji(emojiId: string): Promise<{ id: string }> {
  return api.delete<{ id: string }>(`/emojis/${emojiId}`);
}
