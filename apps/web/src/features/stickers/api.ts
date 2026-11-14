import {
  createStickerSchema,
  type CreateStickerInput,
  type StickerDto,
  type StickerListResponse,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export function listStickers(serverId: string): Promise<StickerListResponse> {
  return api.get<StickerListResponse>(`/servers/${serverId}/stickers`);
}

export function createSticker(serverId: string, input: CreateStickerInput): Promise<StickerDto> {
  const parsed = createStickerSchema.parse(input);
  return api.post<StickerDto>(`/servers/${serverId}/stickers`, parsed);
}

export function deleteSticker(stickerId: string): Promise<{ id: string }> {
  return api.delete<{ id: string }>(`/stickers/${stickerId}`);
}
