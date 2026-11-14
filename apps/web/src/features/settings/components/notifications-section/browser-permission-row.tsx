import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import {
  requestNotificationPermission,
  useNotificationPermission,
} from '@/features/notifications/components/enable-notifications';

export function BrowserPermissionRow() {
  const t = useTranslations('settings.notifications');
  const permission = useNotificationPermission();
  const statusText =
    permission === 'granted'
      ? t('permissionGranted')
      : permission === 'denied'
        ? t('permissionDenied')
        : permission === 'unsupported'
          ? t('permissionUnsupported')
          : t('permissionDefault');
  return (
    <div className="flex items-center justify-between gap-4" data-testid="settings-permission-row">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{t('browserPermission')}</span>
        <p className="text-xs text-muted-foreground" data-testid="settings-permission-status">
          {statusText}
        </p>
      </div>
      {permission === 'default' ? (
        <PingButton
          size="sm"
          variant="secondary"
          data-testid="settings-permission-request"
          onClick={requestNotificationPermission}
        >
          {t('requestPermission')}
        </PingButton>
      ) : null}
    </div>
  );
}
