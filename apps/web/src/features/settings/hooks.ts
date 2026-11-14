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

export function useUserSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: getSettings, staleTime: Infinity });
}

const SETTINGS_DEFAULTS: UserSettingsDto = USER_SETTINGS_DEFAULTS;

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
        apply({
          theme: context.previous.theme,
          density: context.previous.density,
          fontSize: context.previous.fontSize,
        });
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.settings, saved);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

export function useBlockedUsers() {
  return useQuery({ queryKey: qk.blockedUsers, queryFn: listBlocks, staleTime: 30_000 });
}

export function useServerChannels(serverId: string) {
  return useQuery({
    queryKey: qk.channels(serverId),
    queryFn: () => listChannels(serverId),
    staleTime: 30_000,
  });
}
