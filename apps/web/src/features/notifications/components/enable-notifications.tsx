'use client';

import { Bell, BellOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingTooltip } from '@/components/ui/ping-tooltip';

/**
 * Quyền Notification là trạng thái CỦA TRÌNH DUYỆT (ngoài React) — đọc qua
 * useSyncExternalStore để không setState trong effect và không lệch hydration: server luôn
 * coi là 'unsupported' (render rỗng), client đọc quyền thật. Người nghe chỉ để tự cập nhật
 * lại sau khi requestPermission xong.
 */
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

/**
 * Quyền Notification đọc ngoài React (useSyncExternalStore — xem chú thích component dưới).
 * Xuất riêng cho trang cài đặt (TG.13) hiển thị trạng thái quyền, dùng chung một nguồn.
 */
export function useNotificationPermission(): PermissionSnapshot {
  return useSyncExternalStore(subscribePermission, permissionSnapshot, serverPermissionSnapshot);
}

/** Xin quyền trong đúng thao tác người dùng rồi báo mọi nơi đang nghe cập nhật lại. */
export function requestNotificationPermission(): void {
  void Notification.requestPermission().then(() => emitPermissionChange());
}

/**
 * Xin quyền Notification API SAU thao tác người dùng (TG.12 — không xin lúc boot): nút nằm ở
 * chân rail cạnh cụm tài khoản. granted → ẩn; denied → nhãn mờ (trình duyệt đã chặn, nút xin
 * lại vô ích); default → hiện nút, requestPermission phải chạy trong click handler.
 */
export function EnableNotificationsButton() {
  const t = useTranslations('notifications');
  const permission = useNotificationPermission();

  if (permission === 'unsupported' || permission === 'granted') return null;
  if (permission === 'denied') {
    // Trạng thái "bị chặn" là icon như Discord, không phải chữ nhiều dòng trong rail 72 px;
    // nhãn + tooltip vẫn nói rõ lý do cho trình đọc màn hình.
    return (
      <PingTooltip title={t('browserBlockedHint')} placement="right">
        <span
          role="img"
          aria-label={t('browserBlocked')}
          data-testid="notify-browser-blocked"
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
