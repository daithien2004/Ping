'use client';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { channelPath } from '@/features/servers/navigation';
import { useChannels } from '../hooks';
import { CreateChannelAction } from './create-channel-action';

export function ChannelNavigation({ serverId, activeId }: { serverId: string; activeId?: string }) {
  const { data: channels } = useChannels(serverId);
  const t = useTranslations('channels');
  return (
    <nav aria-label={t('navLabel')} className="flex flex-col gap-0.5 p-2">
      {channels.length === 0 && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {channels.map((channel) => (
        <Link
          key={channel.id}
          href={channelPath(serverId, channel.id)}
          aria-current={channel.id === activeId ? 'page' : undefined}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${channel.id === activeId ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground'}`}
        >
          <span className="text-lg leading-none text-muted-foreground">#</span> {channel.name}
        </Link>
      ))}
      <CreateChannelAction serverId={serverId} />
    </nav>
  );
}
