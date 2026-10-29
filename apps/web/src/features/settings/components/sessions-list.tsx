'use client';

import { MonitorSmartphone } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTag } from '@/components/ui/ping-tag';
import { pingToast } from '@/components/ui/ping-toast';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/error-message';

/**
 * Phiên đăng nhập (TG.8): GET /users/me/sessions — mỗi dòng là một refresh token đang sống
 * (thiết bị tóm tắt từ User-Agent ở server). Dòng của phiên đang mở trang đánh dấu «Phiên này»
 * và không cho thu hồi chính nó. Thu hồi xong hook tự invalidate → danh sách tươi lại ngay.
 */
export function SessionsList() {
  const t = useTranslations('settings.account');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const { data: sessions, isPending } = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const list = sessions ?? [];
  const hasOthers = list.some((session) => !session.current);

  const revokeOptions = {
    onSuccess: () => pingToast.success(t('revokeSuccessToast')),
    onError: (error: unknown) => pingToast.error(errorMessage(error)),
  };

  return (
    <div className="flex flex-col" data-testid="settings-sessions">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">{t('sessions')}</h2>
        <PingPopconfirm
          title={t('revokeOthersConfirm')}
          okText={t('sessionRevoke')}
          cancelText={tc('cancel')}
          disabled={!hasOthers || revokeOthers.isPending}
          onConfirm={() => revokeOthers.mutate(undefined, revokeOptions)}
        >
          <PingButton
            size="sm"
            variant="danger"
            data-testid="settings-revoke-other-sessions"
            disabled={!hasOthers || revokeOthers.isPending}
          >
            {t('revokeOthers')}
          </PingButton>
        </PingPopconfirm>
      </div>

      {isPending ? (
        <p className="py-3 text-sm text-muted-foreground">{tc('loading')}</p>
      ) : list.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground" data-testid="settings-sessions-empty">
          {t('sessionsEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {list.map((session) => (
            <li
              key={session.id}
              className="flex items-center justify-between gap-4 py-3"
              data-testid={`settings-session-row-${session.id}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 truncate text-sm font-medium">
                    {session.device}
                    {session.current && (
                      <PingTag color="green" data-testid="settings-session-current">
                        {t('sessionCurrent')}
                      </PingTag>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t('sessionLastUsed')}: {new Date(session.lastUsedAt).toLocaleString(locale)}
                  </span>
                </div>
              </div>
              {!session.current && (
                <PingPopconfirm
                  title={t('sessionRevokeConfirm')}
                  okText={t('sessionRevoke')}
                  cancelText={tc('cancel')}
                  onConfirm={() => revoke.mutate(session.id, revokeOptions)}
                >
                  <PingButton
                    size="sm"
                    variant="danger"
                    data-testid={`settings-session-revoke-${session.id}`}
                    disabled={revoke.isPending}
                  >
                    {t('sessionRevoke')}
                  </PingButton>
                </PingPopconfirm>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
