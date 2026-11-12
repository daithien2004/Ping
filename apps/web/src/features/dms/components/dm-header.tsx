'use client';

import type { DmSummary } from '@ping/shared';
import { Ban, Pin, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingPopover } from '@/components/ui/ping-popover';
import { PinnedPanel } from '@/features/messages/components/pinned-panel';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { UserAvatar } from '@/features/profile/components/user-avatar';

/**
 * Đầu trang hội thoại: đối tác, chuông thông báo, nút ghim và nút chặn/bỏ chặn.
 *
 * DM không có cột phải như kênh server: danh sách ghim mở thành popover ngay dưới nút ghim.
 */
export function DmHeader({
  dm,
  blocked,
  onToggleBlock,
  onOpenPin,
}: {
  dm: DmSummary;
  blocked: boolean;
  onToggleBlock: (block: boolean) => void;
  onOpenPin: (messageId: string) => void;
}) {
  const t = useTranslations('dms');
  const tm = useTranslations('messages');
  const [pinsOpen, setPinsOpen] = useState(false);
  const name = dm.partner.displayName;
  return (
    <header data-testid="dm-header" className="flex h-header shrink-0 items-center gap-2 px-4">
      <UserAvatar name={name} avatarUrl={dm.partner.avatarUrl} size="sm" />
      <p className="truncate font-semibold">{name}</p>
      <span className="truncate text-xs text-muted-foreground">@{dm.partner.username}</span>
      <div className="ml-auto flex items-center gap-1">
        {/* TG.12: DM không có dòng server — chuông đặt mức/mute riêng cho hội thoại này. */}
        <NotificationBell serverId={null} channelId={dm.channelId} dm />
        <PingPopover
          trigger="click"
          placement="bottomRight"
          open={pinsOpen}
          onOpenChange={setPinsOpen}
          content={
            <PinnedPanel
              channelId={dm.channelId}
              variant="popover"
              onOpen={(messageId) => {
                setPinsOpen(false);
                onOpenPin(messageId);
              }}
            />
          }
        >
          <PingIconButton
            icon={<Pin />}
            aria-expanded={pinsOpen}
            aria-label={tm(pinsOpen ? 'pinnedHide' : 'pinnedShow')}
            data-testid="pins-toggle"
          />
        </PingPopover>
        {blocked ? (
          // Bỏ chặn: xác nhận nhẹ — không phải hành động nguy hiểm như chặn.
          <PingPopconfirm
            title={t('unblockConfirm', { name })}
            onConfirm={() => onToggleBlock(false)}
            okText={t('unblock')}
            cancelText={t('cancel')}
          >
            <PingButton variant="secondary" size="sm" data-testid="dm-unblock">
              <Ban /> {t('unblock')}
            </PingButton>
          </PingPopconfirm>
        ) : (
          // Chặn: hành động ảnh hưởng hai chiều — luôn hỏi lại (quy ước PingPopconfirm).
          <PingPopconfirm
            title={t('blockConfirm', { name })}
            description={t('blockHint')}
            onConfirm={() => onToggleBlock(true)}
            okText={t('block')}
            cancelText={t('cancel')}
          >
            <PingButton variant="secondary" size="sm" data-testid="dm-block">
              <ShieldX /> {t('block')}
            </PingButton>
          </PingPopconfirm>
        )}
      </div>
    </header>
  );
}

/**
 * Báo đang bị chặn. API dùng chung một mã `DM_BLOCKED` cho cả hai chiều (chống dò nguyên nhân)
 * nên câu chữ cũng trung lập, không nói ai chặn ai.
 */
export function DmBlockedBanner() {
  const t = useTranslations('dms');
  return (
    <p
      role="status"
      data-testid="dm-blocked-banner"
      className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground"
    >
      {t('blockedBanner')}
    </p>
  );
}
