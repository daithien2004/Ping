'use client';

import { ErrorCodes } from '@ping/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/form-parts';
import { useLeaveServer, useServer } from '@/features/servers/hooks';
import { channelPath } from '@/features/servers/navigation';
import { errorMessage } from '@/lib/error-message';
import { useChannels } from '../hooks';
import { CreateChannelDialog } from './create-channel-dialog';

/** Cột giữa: tên server, mã mời, danh sách channel, rời server. */
export function ChannelSidebar() {
  const { serverId, channelId } = useParams<{ serverId: string; channelId?: string }>();
  const router = useRouter();
  const { data: server } = useServer(serverId);
  const { data: channels } = useChannels(serverId);
  const leaveMutation = useLeaveServer();
  const [creating, setCreating] = useState(false);

  function leave() {
    leaveMutation.mutate(serverId, { onSuccess: () => router.replace('/') });
  }

  return (
    <aside className="flex w-60 flex-col gap-3 bg-gray-100 p-3 dark:bg-gray-800">
      <header>
        <h2 className="truncate font-semibold">{server.name}</h2>
        <p className="text-xs text-gray-500">
          Mã mời: <code className="select-all">{server.inviteCode}</code>
        </p>
      </header>

      <nav aria-label="Channel" className="flex flex-col gap-0.5">
        {channels.map((channel) => (
          <Link
            key={channel.id}
            href={channelPath(serverId, channel.id)}
            aria-current={channel.id === channelId ? 'page' : undefined}
            className={`rounded px-2 py-1 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 ${
              channel.id === channelId ? 'bg-gray-300 font-medium dark:bg-gray-600' : ''
            }`}
          >
            # {channel.name}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="text-left text-sm underline"
      >
        + Tạo channel
      </button>

      <div className="mt-auto flex flex-col gap-1">
        {leaveMutation.isError && (
          <FormError>
            {errorMessage(leaveMutation.error, {
              // 400 duy nhất của endpoint rời server: chủ server phải xóa server hoặc chuyển quyền.
              [ErrorCodes.BAD_REQUEST]: 'Chủ server không thể rời server của mình.',
            })}
          </FormError>
        )}
        <button
          type="button"
          onClick={leave}
          disabled={leaveMutation.isPending}
          className="text-left text-sm text-red-600 underline"
        >
          Rời server
        </button>
      </div>

      <CreateChannelDialog serverId={serverId} open={creating} onClose={() => setCreating(false)} />
    </aside>
  );
}
