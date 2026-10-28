import { z } from 'zod';

/**
 * TG.12: mức thông báo của NGƯỜI DÙNG theo server/channel. Lưu phía API (một bản mỗi user)
 * để mute có hiệu lực trên mọi thiết bị; badge/notification do client tính từ prefs này +
 * dữ liệu unread sẵn có. Thiết bị-riêng (âm thanh, quyền Notification) ở client, không vào đây.
 */
export const NOTIFY_LEVELS = ['all', 'mentions', 'none'] as const;
export type NotifyLevel = (typeof NOTIFY_LEVELS)[number];
export const notifyLevelSchema = z.enum(NOTIFY_LEVELS);

/** Mức mặc định khi chưa cấu hình gì — không đổi hành vi badge hiện có nếu người dùng không đụng. */
export const NOTIFY_DEFAULT_LEVEL: NotifyLevel = 'all';

/** Mute có hạn: null = không mute; mốc trong quá khứ = hết mute. */
export const setNotificationPrefSchema = z.object({
  level: notifyLevelSchema,
  mutedUntil: z.iso.datetime({ offset: true }).nullable(),
});
export type SetNotificationPrefInput = z.infer<typeof setNotificationPrefSchema>;

/** Một dòng prefs của người gọi: theo server hoặc theo channel (override server). */
export interface NotificationPrefDto {
  scope: 'server' | 'channel';
  targetId: string;
  level: NotifyLevel;
  mutedUntil: string | null;
}

export interface NotificationPrefsResponse {
  prefs: NotificationPrefDto[];
}

/**
 * Quyết định thông báo cho một tin (client chạy hàm này trên dữ liệu có sẵn):
 * @everyone/@here chỉ tính là mention khi `ignoreEveryone` tắt (tùy chọn người dùng).
 */
export interface NotifyDecisionInput {
  level: NotifyLevel;
  mutedUntil: string | null;
  isMention: boolean;
  isEveryone: boolean;
  ignoreEveryone: boolean;
  now?: string;
}

export function shouldNotify(input: NotifyDecisionInput): boolean {
  if (input.level === 'none') return false;
  if (input.mutedUntil && new Date(input.mutedUntil).getTime() > Date.parse(input.now ?? '')) {
    return false;
  }
  if (input.level === 'mentions') {
    if (input.isMention) return true;
    return input.isEveryone && !input.ignoreEveryone;
  }
  return true;
}
