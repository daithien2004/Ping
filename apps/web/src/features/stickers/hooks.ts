'use client';
import type { MessageStickerPreview, StickerDto, StickerListResponse } from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { createSticker, deleteSticker, listStickers } from './api';

/**
 * Gói sticker của một server (TG.22): gói hệ thống + gói server, sticker đã xóa không trả.
 * Picker và màn quản trị dùng chung một query; tạo/xóa invalidate đúng server đó.
 */
export function useStickers(serverId: string) {
  return useQuery<StickerListResponse>({
    queryKey: qk.stickers(serverId),
    queryFn: () => listStickers(serverId),
    // Gói biểu cảm đổi hiếm; staleTime 5 phút đủ cho picker mở/đóng liên tục.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSticker(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { attachmentId: string; name: string; tags?: string[] }) =>
      createSticker(serverId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.stickers(serverId) });
    },
  });
}

export function useDeleteSticker(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stickerId: string) => deleteSticker(stickerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.stickers(serverId) });
      // Tin cũ chứa sticker vừa xóa chỉ hiện khung "sticker đã bị xóa" sau khi DTO mới
      // về — invalidate toàn bộ cache tin nhắn của server (hành động hiếm, chấp nhận được).
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

/** Phẳng hóa danh sách gói thành mảng sticker (picker cần một danh sách để tìm/lưới). */
export function flattenStickers(list: StickerListResponse | undefined): StickerDto[] {
  return (list?.packs ?? []).flatMap((pack) => pack.stickers);
}

/** Preview tĩnh gửi kèm tin optimistic khi người dùng chọn sticker (TG.22). */
export function stickerPreviewOf(sticker: StickerDto): MessageStickerPreview {
  return {
    id: sticker.id,
    name: sticker.name,
    deleted: false,
    url: sticker.url,
    previewUrl: sticker.previewUrl,
    width: sticker.width,
    height: sticker.height,
  };
}
