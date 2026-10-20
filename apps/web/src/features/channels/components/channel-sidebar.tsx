'use client';

import { ErrorCodes } from '@ping/shared';
import { LogOut, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { FormError } from '@/components/form-parts';
import { Button } from '@/components/ui/button';
import { useLeaveServer, useServer } from '@/features/servers/hooks';
import { channelPath } from '@/features/servers/navigation';
import { useErrorMessage } from '@/lib/error-message';
import { useChannels } from '../hooks';
import { CreateChannelDialog } from './create-channel-dialog';

/** Cột giữa: tên server, mã mời, danh sách channel, rời server. */
export function ChannelSidebar() {
  const { serverId, channelId } = useParams<{ serverId: string; channelId?: string }>();
  const router = useRouter();
  const { data: server } = useServer(serverId);
  const { data: channels } = useChannels(serverId);
  const leaveMutation = useLeaveServer();
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [creating, setCreating] = useState(false);

  function leave() {
    leaveMutation.mutate(serverId, { onSuccess: () => router.replace('/') });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-sidebar-border px-4 shadow-xs">
        <h2 className="truncate font-semibold">{server.name}</h2>
        <p className="truncate text-xs text-muted-foreground">
          {t('servers.inviteCode')}: <code className="select-all">{server.inviteCode}</code>
        </p>
      </header>

      <nav aria-label={t('channels.navLabel')} className="flex flex-col gap-0.5 p-2">
        {channels.map((channel) => {
          const active = channel.id === channelId;
          return (
            <Link
              key={channel.id}
              href={channelPath(serverId, channel.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                active
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {/* "#" là chữ (không phải icon aria-hidden): tên link đọc ra "# general". */}
              <span className="text-lg leading-none text-muted-foreground">#</span> {channel.name}
            </Link>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCreating(true)}
          className="justify-start text-muted-foreground"
        >
          <Plus /> {t('channels.create')}
        </Button>
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border p-2">
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

      <CreateChannelDialog serverId={serverId} open={creating} onClose={() => setCreating(false)} />
    </aside>
  );
}
