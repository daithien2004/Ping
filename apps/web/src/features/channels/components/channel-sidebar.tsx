'use client';

import { ErrorCodes } from '@ping/shared';
import { Copy, LogOut, Settings } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { FormError } from '@/components/form-parts';
import { Button } from '@/components/ui/button';
import { pingToast } from '@/components/ui/ping-toast';
import { useLeaveServer, useServer } from '@/features/servers/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { useErrorMessage } from '@/lib/error-message';
import { ChannelNavigation } from './channel-navigation';

/** Cột giữa: tên server, mã mời, danh sách channel, rời server. */
export function ChannelSidebar() {
  const { serverId, channelId } = useParams<{ serverId: string; channelId?: string }>();
  const router = useRouter();
  const { data: server } = useServer(serverId);
  const { ability } = useServerAbility();
  const leaveMutation = useLeaveServer();
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
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-sidebar-border px-4 shadow-xs">
        <h2 className="truncate font-semibold">{server.name}</h2>
        <div className="flex items-center gap-1">
          <p className="truncate text-xs text-muted-foreground">
            {t('servers.inviteCode')}: <code className="select-all">{server.inviteCode}</code>
          </p>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('servers.copyInvite')}
            onClick={() => void copyInvite()}
          >
            <Copy />
          </Button>
        </div>
      </header>

      {ability.can('view', 'Channel') && (
        <ChannelNavigation serverId={serverId} activeId={channelId} />
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border p-2">
        {canOpenSettings && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => router.push(`/servers/${serverId}/settings`)}
          >
            <Settings /> {t('admin.open')}
          </Button>
        )}
        {leaveMutation.isError && (
          <FormError>
            {errorMessage(leaveMutation.error, {
              // 400 duy nhất của endpoint rời server: chủ server phải xóa server hoặc chuyển quyền.
              [ErrorCodes.BAD_REQUEST]: t('servers.ownerCannotLeave'),
            })}
          </FormError>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={leave}
          disabled={leaveMutation.isPending}
          className="justify-start"
        >
          <LogOut /> {t('servers.leave')}
        </Button>
      </div>
    </aside>
  );
}
