'use client';

import { ErrorCodes } from '@ping/shared';
import { ChevronDown, Copy, LogOut, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { FormError } from '@/components/form-parts';
import { PingDropdown } from '@/components/ui/ping-dropdown';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { pingToast } from '@/components/ui/ping-toast';
import { useLeaveServer, useServer } from '@/features/servers/hooks';
import { useCurrentServerId, useServerAbility } from '@/features/permissions/context';
import { useMobileNav } from '@/features/shell/store';
import { channelIdFromPath } from '@/lib/channel-url';
import { useErrorMessage } from '@/lib/error-message';
import { ChannelNavigation } from './channel-navigation';

export function ChannelSidebar() {
  // serverId từ provider, KHÔNG useParams(): <Activity> giữ layout ẩn nên useParams() trả params URL hiện tại.
  const channelId = channelIdFromPath(usePathname()) ?? undefined;
  const router = useRouter();
  const { ability } = useServerAbility();
  const serverId = useCurrentServerId();
  const { data: server } = useServer(serverId);
  const leaveMutation = useLeaveServer();
  const mobileNavOpen = useMobileNav((state) => state.open);
  const t = useTranslations();
  const errorMessage = useErrorMessage();

  const canOpenSettings =
    ability.can('manage', 'Role') ||
    ability.can('view', 'AuditLog') ||
    ability.can('update', 'Server');

  function leave() {
    leaveMutation.mutate(serverId, { onSuccess: () => router.replace('/servers') });
  }

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
      data-slot="sidebar"
      className={`flex min-h-0 w-sidebar shrink-0 flex-col bg-sidebar text-sidebar-foreground max-md:absolute max-md:inset-y-0 max-md:left-18 max-md:z-30 max-md:shadow-overlay max-md:transition-transform max-md:duration-200 ${
        mobileNavOpen
          ? 'max-md:visible max-md:translate-x-0'
          : 'max-md:invisible max-md:-translate-x-full'
      }`}
    >
      <header
        data-slot="sidebar-header"
        className="flex h-header shrink-0 items-center gap-1 border-b border-sidebar-border pl-4 pr-2"
      >
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
              ...(canOpenSettings
                ? [
                    {
                      key: 'settings',
                      icon: <Settings />,
                      label: t('admin.title'),
                      onClick: () => router.push(`/servers/${serverId}/settings`),
                    },
                  ]
                : []),
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
            size="sm"
            aria-label={t('servers.menu')}
            aria-haspopup="menu"
          />
        </PingDropdown>
      </header>

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

      {ability.can('view', 'Channel') && (
        <ChannelNavigation serverId={serverId} activeId={channelId} />
      )}
    </aside>
  );
}
