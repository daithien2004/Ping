'use client';

import { Settings } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingModal } from '@/components/ui/ping-modal';
import { PingTooltip } from '@/components/ui/ping-tooltip';
import { useMe } from '@/features/auth/hooks';
import { useSettingsModal } from '@/features/settings/modal-store';
import { SelfProfileCard } from './profile-popover';
import { UserAvatar } from './user-avatar';

/**
 * Panel người dùng của app (Discord): render một lần ở AppShell nên có mặt ở server, DM và cài
 * đặt — không thuộc sidebar cụ thể nào. Là thẻ nổi (bo góc, cách mép, có bóng) thay vì thanh dán
 * đáy cột; khung/nền nằm trong component để mọi skin đều nổi, skin chỉ đổi màu sắc và viền.
 * Avatar mở thẻ hồ sơ; bánh răng mở cài đặt CÁ NHÂN (cài đặt server nằm trong menu tên server).
 */
export function UserCard() {
  const { data: me } = useMe();
  const [profileOpen, setProfileOpen] = useState(false);
  const openSettings = useSettingsModal((state) => state.openSettings);
  const t = useTranslations();

  return (
    <div
      data-slot="user-card"
      className="mx-2 mb-2 flex h-13 items-center gap-2 rounded-lg border border-border bg-card px-2 shadow-panel"
    >
      <button
        type="button"
        aria-label={me ? t('profile.openSelfProfile') : undefined}
        aria-haspopup="dialog"
        data-testid="self-avatar"
        className="rounded-full focus-ring"
        onClick={() => setProfileOpen(true)}
      >
        <UserAvatar name={me?.displayName ?? ''} avatarUrl={me?.avatarUrl} size={32} />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{me?.displayName}</p>
        {me?.username && <p className="truncate text-xs text-muted-foreground">@{me.username}</p>}
      </div>
      <PingTooltip title={t('settings.railOpen')} placement="top">
        <PingIconButton
          icon={<Settings />}
          aria-label={t('settings.railOpen')}
          data-testid="personal-settings"
          onClick={() => openSettings()}
        />
      </PingTooltip>

      <PingModal
        title={me ? t('profile.selfTitle', { name: me.displayName }) : undefined}
        open={profileOpen}
        onCancel={() => setProfileOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <SelfProfileCard />
      </PingModal>
    </div>
  );
}
