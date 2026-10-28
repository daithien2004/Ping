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

/**
 * Prefs thông báo của chính người gọi (TG.12). staleTime 30 giây: prefs không đổi liên tục,
 * các thao tác đặt/reset đều invalidate nên không cần refetch dày hơn. Được mount cả ở popover
 * chuông lẫn hook event realtime — chung key nên TanStack tự gộp một request.
 */
export function useNotificationPrefs() {
  return useQuery({
    queryKey: qk.notificationPrefs,
    queryFn: listNotificationPrefs,
    staleTime: 30_000,
  });
}

export type NotificationScope = 'server' | 'channel';

/**
 * Đặt mức/mute cho một target (TG.12). Cache được ghi thẳng dòng mới để popover phản hồi ngay,
 * rồi invalidate để đối soát lại với server (prefs lưu phía API nên mute có hiệu lực mọi thiết bị).
 */
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

/** Reset về mặc định (DELETE idempotent 204) — gỡ dòng override khỏi cache rồi đối soát. */
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
