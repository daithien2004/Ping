'use client';

import { ErrorCodes } from '@ping/shared';
import { ChevronDown, Copy, LogOut, Settings } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { FormError } from '@/components/form-parts';
import { PingDropdown } from '@/components/ui/ping-dropdown';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { useLeaveServer, useServer } from '@/features/servers/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { useMobileNav } from '@/features/shell/store';
import { useErrorMessage } from '@/lib/error-message';
import { ChannelNavigation } from './channel-navigation';

/** Cột giữa: tên server, danh sách channel, thẻ người dùng (Discord) — mã mời và rời server
 *  nằm trong menu của header. */
export function ChannelSidebar() {
  // serverId lấy từ provider của layout (đóng băng theo params prop), KHÔNG từ useParams():
  // rời server sang /dms thì <Activity> giữ layout này ẩn và useParams() trả serverId = undefined
  // → GET /servers/undefined 400 (ADR-0020). channelId chỉ để tô sáng nên đọc từ URL là đủ.
  const { channelId } = useParams<{ channelId?: string }>();
  const router = useRouter();
  const { ability, serverId } = useServerAbility();
  const { data: server } = useServer(serverId);
  const { data: me } = useMe();
  const leaveMutation = useLeaveServer();
  const mobileNavOpen = useMobileNav((state) => state.open);
  const t = useTranslations();
  const errorMessage = useErrorMessage();

  // Bề mặt quản trị (TF.10): chỉ hiện lối vào khi người dùng có ít nhất một quyền quản trị
  // (quản lý vai trò, xem nhật ký hành động hoặc quản lý server).
  const canOpenSettings =
    ability.can('manage', 'Role') ||
    ability.can('view', 'AuditLog') ||
    ability.can('update', 'Server');

  function leave() {
    leaveMutation.mutate(serverId, { onSuccess: () => router.replace('/servers') });
  }

  // Sao chép mã mời: hành động ngầm, thành công thì báo bằng toast (quy ước TF.9).
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(server.inviteCode);
      pingToast.success(t('servers.inviteCopied'));
    } catch {
      pingToast.error(t('servers.copyFailed'));
    }
  }

  return (
    <aside
      data-mobile-nav
      className={`flex min-h-0 w-sidebar shrink-0 flex-col bg-sidebar text-sidebar-foreground max-md:absolute max-md:inset-y-0 max-md:left-18 max-md:z-30 max-md:shadow-overlay max-md:transition-transform max-md:duration-200 ${
        mobileNavOpen
          ? 'max-md:visible max-md:translate-x-0'
          : 'max-md:invisible max-md:-translate-x-full'
      }`}
    >
      {/* Discord: header 49 px một dòng, tên server mở menu (mã mời + rời server). */}
      <header className="flex h-header shrink-0 items-center gap-1 border-b border-sidebar-border pl-4 pr-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{server.name}</h2>
        <PingDropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'copy', icon: <Copy />, label: t('servers.copyInvite') },
              {
                key: 'code',
                disabled: true,
                label: <code className="select-all text-xs">{server.inviteCode}</code>,
              },
              { type: 'divider' },
              {
                key: 'leave',
                danger: true,
                icon: <LogOut />,
                label: t('servers.leave'),
                disabled: leaveMutation.isPending,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'copy') void copyInvite();
              if (key === 'leave') leave();
            },
          }}
        >
          <PingIconButton
            icon={<ChevronDown />}
            size="small"
            aria-label={t('servers.menu')}
            aria-haspopup="menu"
          />
        </PingDropdown>
      </header>

      {ability.can('view', 'Channel') && (
        <ChannelNavigation serverId={serverId} activeId={channelId} />
      )}

      {/* Discord: thẻ người dùng 52 px ở đáy cột kênh — danh tính + lối vào cài đặt server. */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border">
        {leaveMutation.isError && (
          <div className="px-2 pt-2">
            <FormError>
              {errorMessage(leaveMutation.error, {
                // 400 duy nhất của endpoint rời server: chủ server phải xóa server hoặc chuyển quyền.
                [ErrorCodes.BAD_REQUEST]: t('servers.ownerCannotLeave'),
              })}
            </FormError>
          </div>
        )}
        <div className="flex h-13 items-center gap-2 px-2">
          <UserAvatar name={me?.displayName ?? ''} avatarUrl={me?.avatarUrl} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{me?.displayName}</p>
            {me?.username && (
              <p className="truncate text-xs text-muted-foreground">@{me.username}</p>
            )}
          </div>
          {canOpenSettings && (
            <PingIconButton
              icon={<Settings />}
              aria-label={t('admin.open')}
              onClick={() => router.push(`/servers/${serverId}/settings`)}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
