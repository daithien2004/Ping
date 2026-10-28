'use client';

import { Bell } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
 * Xin quyền Notification API SAU thao tác người dùng (TG.12 — không xin lúc boot): nút nằm ở
 * chân rail cạnh cụm tài khoản. granted → ẩn; denied → nhãn mờ (trình duyệt đã chặn, nút xin
 * lại vô ích); default → hiện nút, requestPermission phải chạy trong click handler.
 */
export function EnableNotificationsButton() {
  const t = useTranslations('notifications');
  const permission = useSyncExternalStore(
    subscribePermission,
    permissionSnapshot,
    serverPermissionSnapshot,
  );

  if (permission === 'unsupported' || permission === 'granted') return null;
  if (permission === 'denied') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* "Mờ" nhưng vẫn đạt contrast ≥ 4.5:1 trên nền rail ở CẢ hai theme (axe/a11y.spec). */}
          <p
            data-testid="notify-browser-blocked"
            className="w-full text-center text-[10px] leading-tight text-rail-foreground/85"
          >
            {t('browserBlocked')}
          </p>
        </TooltipTrigger>
        <TooltipContent side="right">{t('browserBlockedHint')}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('enableBrowser')}
          data-testid="notify-enable"
          onClick={() => {
            // Xin quyền trong đúng thao tác người dùng (yêu cầu của trình duyệt + plan TG.12).
            void Notification.requestPermission().then(() => emitPermissionChange());
          }}
        >
          <Bell className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{t('enableBrowser')}</TooltipContent>
    </Tooltip>
  );
}
