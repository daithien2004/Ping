'use client';

import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingSwitch } from '@/components/ui/ping-switch';
import { pingToast } from '@/components/ui/ping-toast';
import { useToggleBlock, usePrivacy, useUpdatePrivacy } from '@/features/dms/hooks';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { useErrorMessage } from '@/lib/error-message';
import { useBlockedUsers } from '../hooks';
import { SettingsSection } from './settings-section';

/** Mức DM khi chưa tải xong — khớp mặc định phía API (dmAllow cột User, TG.9). */
const DM_ALLOW_DEFAULT = 'server_members';

/** Switch mức nhận DM: GET giá trị đã lưu, PATCH /users/me/privacy khi đổi (mọi thiết bị). */
function DmAllowSwitch() {
  const t = useTranslations('settings.privacy');
  const errorMessage = useErrorMessage();
  const { data, isPending } = usePrivacy();
  const updatePrivacy = useUpdatePrivacy();
  const dmAllow = data?.dmAllow ?? DM_ALLOW_DEFAULT;

  return (
    <div className="flex items-center justify-between gap-4" data-testid="settings-dm-row">
      <div className="flex flex-col">
        <span className="text-sm font-medium" id="settings-dm-allow-label">
          {t('dmAllow')}
        </span>
        <p className="text-xs text-muted-foreground">{t('dmAllowHint')}</p>
      </div>
      <PingSwitch
        size="small"
        checked={dmAllow === 'server_members'}
        disabled={isPending || updatePrivacy.isPending}
        aria-labelledby="settings-dm-allow-label"
        data-testid="settings-dm-allow"
        onChange={(value) => {
          updatePrivacy.mutate(
            { dmAllow: value ? 'server_members' : 'none' },
            { onError: (error) => pingToast.error(errorMessage(error)) },
          );
        }}
      />
    </div>
  );
}

/**
 * Riêng tư (TG.13): mức nhận DM từ thành viên server + danh sách người đang chặn với nút bỏ
 * chặn (tái dùng DELETE /users/:id/block của TG.9 qua `useToggleBlock` — hook đó cập nhật
 * store DM của TG.9 và invalidate danh sách này).
 */
export function PrivacySection() {
  const t = useTranslations('settings.privacy');
  const { data: blocks } = useBlockedUsers();
  const unblock = useToggleBlock();
  const blocked = blocks?.blocked ?? [];

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-privacy">
      <div className="flex max-w-2xl flex-col gap-6">
        <DmAllowSwitch />

        <section aria-label={t('blockedTitle')} className="flex flex-col">
          <h2 className="text-sm font-semibold">{t('blockedTitle')}</h2>
          {blocked.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground" data-testid="settings-blocked-empty">
              {t('blockedEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {blocked.map((user) => (
                <li
                  key={user.userId}
                  className="flex items-center justify-between gap-4 py-3"
                  data-testid={`settings-blocked-row-${user.userId}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{user.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        @{user.username}
                      </span>
                    </div>
                  </div>
                  <PingPopconfirm
                    title={t('unblockConfirmTitle')}
                    okText={t('unblock')}
                    cancelText={t('cancel')}
                    onConfirm={() => unblock.mutate({ userId: user.userId, block: false })}
                  >
                    <PingButton
                      size="sm"
                      variant="secondary"
                      data-testid={`settings-unblock-${user.userId}`}
                      disabled={unblock.isPending}
                    >
                      {t('unblock')}
                    </PingButton>
                  </PingPopconfirm>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SettingsSection>
  );
}
