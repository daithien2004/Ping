'use client';
import type { MessageStickerPreview, StickerDto, StickerListResponse } from '@ping/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { createSticker, deleteSticker, listStickers } from './api';

const STICKER_STALE_TIME = 5 * 60 * 1000;

export function useStickers(serverId: string) {
  return useQuery<StickerListResponse>({
    queryKey: qk.stickers(serverId),
    queryFn: () => listStickers(serverId),
    staleTime: STICKER_STALE_TIME,
  });
}

export function prefetchStickers(queryClient: QueryClient, serverId: string): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: qk.stickers(serverId),
    queryFn: () => listStickers(serverId),
    staleTime: STICKER_STALE_TIME,
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
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function flattenStickers(list: StickerListResponse | undefined): StickerDto[] {
  return (list?.packs ?? []).flatMap((pack) => pack.stickers);
}

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
