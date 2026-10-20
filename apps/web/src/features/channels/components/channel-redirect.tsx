'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { channelPath } from '@/features/servers/navigation';
import { useChannels } from '../hooks';

/** /servers/:id → channel đầu tiên của server. */
export function ChannelRedirect() {
  const { serverId } = useParams<{ serverId: string }>();
  const router = useRouter();
  const { data: channels } = useChannels(serverId);
  const first = channels[0];

  useEffect(() => {
    if (first) router.replace(channelPath(serverId, first.id));
  }, [first, serverId, router]);

  return first ? null : <p className="m-auto text-sm text-gray-500">Server chưa có channel nào.</p>;
}
