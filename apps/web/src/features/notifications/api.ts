import {
  notifyLevelSchema,
  type NotificationPrefDto,
  type NotificationPrefsResponse,
  type SetNotificationPrefInput,
} from '@ping/shared';
import { z } from 'zod';
import { api } from '@/lib/api-client';

/**
 * TG.12: prefs thông báo của CHÍNH người gọi. Response không có schema dùng chung nên parse
 * ở biên bằng schema cục bộ dựng TỪ các atom của shared (notifyLevelSchema) — không định nghĩa
 * lại ngữ nghĩa, chỉ khẳng định hình dạng dữ liệu trước khi vào cache.
 */
const notificationPrefDtoSchema = z.object({
  scope: z.enum(['server', 'channel']),
  targetId: z.uuid(),
  level: notifyLevelSchema,
  mutedUntil: z.iso.datetime({ offset: true }).nullable(),
});

const notificationPrefsResponseSchema = z.object({
  prefs: z.array(notificationPrefDtoSchema),
});

/** Mọi dòng prefs của người gọi — fetch một lần khi boot, event realtime không đụng prefs này. */
export const listNotificationPrefs = () =>
  api.get<NotificationPrefsResponse>(
    '/users/me/notification-prefs',
    notificationPrefsResponseSchema,
  );

const setPref = (path: string, input: SetNotificationPrefInput) =>
  api.put<NotificationPrefDto>(path, input);

/** Đặt mức/mute theo server. Server trả lại dòng prefs sau khi lưu (sửa = 200). */
export const setServerPref = (serverId: string, input: SetNotificationPrefInput) =>
  setPref(`/users/me/notification-prefs/server/${serverId}`, input);

/** Đặt mức/mute theo channel (override dòng server). */
export const setChannelPref = (channelId: string, input: SetNotificationPrefInput) =>
  setPref(`/users/me/notification-prefs/channel/${channelId}`, input);

/** Reset về mặc định — idempotent 204. Màn cài đặt đầy đủ thuộc TG.13, hook reset nối sau. */
export const resetServerPref = (serverId: string) =>
  api.delete<void>(`/users/me/notification-prefs/server/${serverId}`);
export const resetChannelPref = (channelId: string) =>
  api.delete<void>(`/users/me/notification-prefs/channel/${channelId}`);
