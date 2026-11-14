'use client';

import type { NotificationPrefDto, NotificationPrefsResponse, NotifyLevel } from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import {
  listNotificationPrefs,
  resetChannelPref,
  resetServerPref,
  setChannelPref,
  setServerPref,
} from './api';
import { removePref, upsertPref } from './notification-cache';

export function useNotificationPrefs() {
  return useQuery({
    queryKey: qk.notificationPrefs,
    queryFn: listNotificationPrefs,
    staleTime: 30_000,
  });
}

export type NotificationScope = 'server' | 'channel';

export function useSetNotificationPref(scope: NotificationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { targetId: string; level: NotifyLevel; mutedUntil: string | null }) =>
      scope === 'server'
        ? setServerPref(input.targetId, { level: input.level, mutedUntil: input.mutedUntil })
        : setChannelPref(input.targetId, { level: input.level, mutedUntil: input.mutedUntil }),
    onSuccess: (row: NotificationPrefDto) => {
      queryClient.setQueryData<NotificationPrefsResponse>(qk.notificationPrefs, (old) =>
        upsertPref(old, row),
      );
      void queryClient.invalidateQueries({ queryKey: qk.notificationPrefs });
    },
  });
}

export function useResetNotificationPref(scope: NotificationScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetId: string) =>
      scope === 'server' ? resetServerPref(targetId) : resetChannelPref(targetId),
    onSuccess: (_result, targetId) => {
      queryClient.setQueryData<NotificationPrefsResponse>(qk.notificationPrefs, (old) =>
        removePref(old, scope, targetId),
      );
      void queryClient.invalidateQueries({ queryKey: qk.notificationPrefs });
    },
  });
}
