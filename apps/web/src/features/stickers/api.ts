import {
  createStickerSchema,
  type CreateStickerInput,
  type StickerDto,
  type StickerListResponse,
} from '@ping/shared';
import { api } from '@/lib/api-client';

/** GET /servers/:id/stickers — gói hệ thống + gói của server (TG.22, ADR-0067). */
export function listStickers(serverId: string): Promise<StickerListResponse> {
  return api.get<StickerListResponse>(`/servers/${serverId}/stickers`);
}

/** POST /servers/:id/stickers — claim tệp đã kiểm định thành sticker (trần 30 ở service). */
export function createSticker(serverId: string, input: CreateStickerInput): Promise<StickerDto> {
  const parsed = createStickerSchema.parse(input);
  return api.post<StickerDto>(`/servers/${serverId}/stickers`, parsed);
}

/** DELETE /stickers/:id — soft-delete; tin cũ sẽ hiển thị khung "sticker đã bị xóa". */
export function deleteSticker(stickerId: string): Promise<{ id: string }> {
  return api.delete<{ id: string }>(`/stickers/${stickerId}`);
}
