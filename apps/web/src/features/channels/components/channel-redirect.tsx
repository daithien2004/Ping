'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';
import { useCurrentServerId } from '@/features/permissions/context';
import { channelPath } from '@/features/servers/navigation';
import { useChannels } from '../hooks';

/** /servers/:id → channel đầu tiên của server. serverId từ provider, không từ useParams() (ADR-0020). */
export function ChannelRedirect() {
  const serverId = useCurrentServerId();
  const router = useRouter();
  const { data: channels } = useChannels(serverId);
  const first = channels[0];
  const t = useTranslations('channels');

  useEffect(() => {
    if (first) router.replace(channelPath(serverId, first.id));
  }, [first, serverId, router]);

  return first ? null : <p className="m-auto text-sm text-muted-foreground">{t('empty')}</p>;
}
