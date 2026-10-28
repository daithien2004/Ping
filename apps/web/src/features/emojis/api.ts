import {
  createCustomEmojiSchema,
  type CreateCustomEmojiInput,
  type CustomEmojiDto,
  type CustomEmojiListResponse,
} from '@ping/shared';
import { api } from '@/lib/api-client';

/** GET /servers/:id/emojis — toàn bộ emoji còn sống của server (TG.24, ADR-0068). */
export function listEmojis(serverId: string): Promise<CustomEmojiListResponse> {
  return api.get<CustomEmojiListResponse>(`/servers/${serverId}/emojis`);
}

/** POST /servers/:id/emojis — claim tệp đã kiểm định thành emoji (trần 50+50 ở service). */
export function createEmoji(
  serverId: string,
  input: CreateCustomEmojiInput,
): Promise<CustomEmojiDto> {
  const parsed = createCustomEmojiSchema.parse(input);
  return api.post<CustomEmojiDto>(`/servers/${serverId}/emojis`, parsed);
}

/** DELETE /emojis/:id — soft-delete; tin cũ chứa emoji sẽ hiển thị placeholder `:ten:`. */
export function deleteEmoji(emojiId: string): Promise<{ id: string }> {
  return api.delete<{ id: string }>(`/emojis/${emojiId}`);
}
