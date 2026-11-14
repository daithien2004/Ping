'use client';

import { Bell, BellOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingTooltip } from '@/components/ui/ping-tooltip';

/** Quyền Notification đọc qua useSyncExternalStore: server luôn 'unsupported' để khỏi lệch hydration. */
const listeners = new Set<() => void>();

type PermissionSnapshot = NotificationPermission | 'unsupported';

const subscribePermission = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};
const permissionSnapshot = (): PermissionSnapshot =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
const serverPermissionSnapshot = (): PermissionSnapshot => 'unsupported';

const emitPermissionChange = () => {
  for (const listener of listeners) listener();
};

export function useNotificationPermission(): PermissionSnapshot {
  return useSyncExternalStore(subscribePermission, permissionSnapshot, serverPermissionSnapshot);
}

export function requestNotificationPermission(): void {
  void Notification.requestPermission().then(() => emitPermissionChange());
}

/** requestPermission phải chạy trong click handler (không xin lúc boot). */
export function EnableNotificationsButton() {
  const t = useTranslations('notifications');
  const permission = useNotificationPermission();

  if (permission === 'unsupported' || permission === 'granted') return null;
  if (permission === 'denied') {
    return (
      <PingTooltip title={t('browserBlockedHint')} placement="right">
        <span
          role="img"
          aria-label={t('browserBlocked')}
          data-testid="notify-browser-blocked"
          data-slot="notify-blocked"
          className="flex size-8 items-center justify-center text-rail-foreground/85"
        >
          <BellOff className="size-5" />
        </span>
      </PingTooltip>
    );
  }
  return (
    <PingTooltip title={t('enableBrowser')} placement="right">
      <PingIconButton
        icon={<Bell className="size-5" />}
        aria-label={t('enableBrowser')}
        data-testid="notify-enable"
        onClick={requestNotificationPermission}
      />
    </PingTooltip>
  );
}
