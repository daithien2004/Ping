'use client';

import {
  USER_SETTINGS_DEFAULTS,
  type UpdateUserSettingsInput,
  type UserSettingsDto,
} from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listChannels } from '@/features/channels/api';
import { listBlocks } from '@/features/dms/api';
import { qk } from '@/lib/query-keys';
import { getSettings, patchSettings } from './api';
import { useAppliedSettings } from './store';

/**
 * Cài đặt người dùng (TG.13) — fetch một lần khi boot (SettingsSync gắn sau AuthGate) rồi
 * giữ ở cache: đổi cài đặt được ghi optimistically vào cache, nên không cần refetch định kỳ.
 */
export function useUserSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: getSettings, staleTime: Infinity });
}

/** Mặc định server trả khi chưa có hàng — cùng hằng của API và store thiết bị. */
const SETTINGS_DEFAULTS: UserSettingsDto = USER_SETTINGS_DEFAULTS;

/**
 * PATCH /users/me/settings (TG.13): áp dụng NGAY trên thiết bị này (ghi store cho
 * theme-provider + cache) rồi lưu server; tab/thiết bị khác nhận giá trị khi tải trang.
 * Lỗi server → trả cache + store về bản trước để giao diện khớp lại nguồn sự thật.
 */
export function usePatchSettings() {
  const queryClient = useQueryClient();
  const apply = useAppliedSettings((state) => state.apply);
  return useMutation({
    mutationFn: (input: UpdateUserSettingsInput) => patchSettings(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.settings });
      const previous = queryClient.getQueryData<UserSettingsDto>(qk.settings);
      queryClient.setQueryData<UserSettingsDto>(qk.settings, (old) => ({
        ...(old ?? SETTINGS_DEFAULTS),
        ...input,
      }));
      // Chỉ các trường giao diện mới đổi được thứ áp dụng tức thời; locale đi đường cookie+reload.
      const { theme, density, fontSize } = input;
      apply({
        ...(theme !== undefined ? { theme } : {}),
        ...(density !== undefined ? { density } : {}),
        ...(fontSize !== undefined ? { fontSize } : {}),
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(qk.settings, context.previous);
        // Store chỉ giữ 3 trường giao diện (locale đi đường cookie+reload).
        apply({
          theme: context.previous.theme,
          density: context.previous.density,
          fontSize: context.previous.fontSize,
        });
      }
    },
    onSuccess: (saved) => {
      // Đối soát lại với server (DTO đầy đủ) — mọi thiết bị đều đọc cùng hình dạng này.
      queryClient.setQueryData(qk.settings, saved);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

/**
 * Danh sách người tôi đã chặn (TG.13): bối cảnh "bỏ chặn" tái dùng `useToggleBlock` của
 * TG.9 — hook đó tự invalidate key này sau khi DELETE xong nên danh sách tự tươi.
 */
export function useBlockedUsers() {
  return useQuery({ queryKey: qk.blockedUsers, queryFn: listBlocks, staleTime: 30_000 });
}

/**
 * Kênh của một server, dùng chung cache với ChannelSidebar (cùng key `qk.channels`): trang
 * Thông báo cần tên kênh cho các dòng ghi đè theo kênh. Phiên bản `useQuery` thường (không
 * suspense) để một server tải chậm không treo cả mục cài đặt.
 */
export function useServerChannels(serverId: string) {
  return useQuery({
    queryKey: qk.channels(serverId),
    queryFn: () => listChannels(serverId),
    staleTime: 30_000,
  });
}
