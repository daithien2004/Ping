import {
  notifyLevelSchema,
  type NotificationPrefDto,
  type NotificationPrefsResponse,
  type SetNotificationPrefInput,
} from '@ping/shared';
import { z } from 'zod';
import { api } from '@/lib/api-client';

const notificationPrefDtoSchema = z.object({
  scope: z.enum(['server', 'channel']),
  targetId: z.uuid(),
  level: notifyLevelSchema,
  mutedUntil: z.iso.datetime({ offset: true }).nullable(),
});

const notificationPrefsResponseSchema = z.object({
  prefs: z.array(notificationPrefDtoSchema),
});

export const listNotificationPrefs = () =>
  api.get<NotificationPrefsResponse>(
    '/users/me/notification-prefs',
    notificationPrefsResponseSchema,
  );

const setPref = (path: string, input: SetNotificationPrefInput) =>
  api.put<NotificationPrefDto>(path, input);

export const setServerPref = (serverId: string, input: SetNotificationPrefInput) =>
  setPref(`/users/me/notification-prefs/server/${serverId}`, input);

export const setChannelPref = (channelId: string, input: SetNotificationPrefInput) =>
  setPref(`/users/me/notification-prefs/channel/${channelId}`, input);

export const resetServerPref = (serverId: string) =>
  api.delete<void>(`/users/me/notification-prefs/server/${serverId}`);
export const resetChannelPref = (channelId: string) =>
  api.delete<void>(`/users/me/notification-prefs/channel/${channelId}`);
