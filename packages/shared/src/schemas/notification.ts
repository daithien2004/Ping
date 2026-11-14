import { z } from 'zod';

/** Lưu phía API; thiết bị-riêng (âm thanh, quyền Notification) ở client, không vào đây. */
export const NOTIFY_LEVELS = ['all', 'mentions', 'none'] as const;
export type NotifyLevel = (typeof NOTIFY_LEVELS)[number];
export const notifyLevelSchema = z.enum(NOTIFY_LEVELS);

export const NOTIFY_DEFAULT_LEVEL: NotifyLevel = 'all';

/** null = không mute; mốc trong quá khứ = hết mute. */
export const setNotificationPrefSchema = z.object({
  level: notifyLevelSchema,
  mutedUntil: z.iso.datetime({ offset: true }).nullable(),
});
export type SetNotificationPrefInput = z.infer<typeof setNotificationPrefSchema>;

export interface NotificationPrefDto {
  scope: 'server' | 'channel';
  targetId: string;
  level: NotifyLevel;
  mutedUntil: string | null;
}

export interface NotificationPrefsResponse {
  prefs: NotificationPrefDto[];
}

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
