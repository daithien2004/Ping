'use client';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { PingBadge } from '@/components/ui/ping-badge';
import { channelPath } from '@/features/servers/navigation';
import { useServerAbility } from '@/features/permissions/context';
import { useUnread } from '@/features/unread/hooks';
import { useChannels } from '../hooks';
import { CreateChannelAction } from './create-channel-action';

export function ChannelNavigation({ serverId, activeId }: { serverId: string; activeId?: string }) {
  const { data: channels } = useChannels(serverId);
  const { ability } = useServerAbility();
  const t = useTranslations('channels');
  const canCreate = ability.can('create', 'Channel');
  const channelSidebarEmpty = channels.length === 0 && !canCreate;
  return (
    <nav aria-label={t('navLabel')} className="flex flex-col gap-0.5 p-2">
      {channelSidebarEmpty && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {channels.map((channel) => (
        <ChannelItem
          key={channel.id}
          serverId={serverId}
          channelId={channel.id}
          name={channel.name}
          active={channel.id === activeId}
        />
      ))}
      <CreateChannelAction serverId={serverId} />
    </nav>
  );
}

/**
 * Một channel trong sidebar kèm badge unread (T4.3): mention > 0 → badge đỏ; unread > 0 →
 * chữ đậm + badge số tin. Kênh đang xem luôn sạch (mark-read chạy khi có tin mới).
 */
function ChannelItem({
  serverId,
  channelId,
  name,
  active,
}: {
  serverId: string;
  channelId: string;
  name: string;
  active: boolean;
}) {
  const { data: unread } = useUnread(serverId);
  const row = unread?.find((item) => item.channelId === channelId);
  const unreadCount = active ? 0 : (row?.unreadCount ?? 0);
  const mentionCount = active ? 0 : (row?.mentionCount ?? 0);

  return (
    <Link
      href={channelPath(serverId, channelId)}
      aria-current={active ? 'page' : undefined}
      // Tên tiếp cận LUÔN ổn định "# tên": số unread nằm trong badge con (có title riêng),
      // không đổi tên link theo trạng thái — trình đọc màn hình và mọi locator không bị
      // "nhảy tên" khi badge xuất hiện/biến mất.
      aria-label={`# ${name}`}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
        active
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
          : unreadCount > 0
            ? 'font-medium text-sidebar-foreground'
            : 'text-muted-foreground'
      }`}
    >
      <span className="text-lg leading-none text-muted-foreground">#</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {mentionCount > 0 ? (
        <PingBadge
          count={mentionCount}
          color="red"
          title={`@${mentionCount}`}
          data-testid="mention-badge"
        />
      ) : (
        unreadCount > 0 && (
          <PingBadge
            count={unreadCount}
            className="bg-sidebar-accent text-sidebar-accent-foreground"
            data-testid="unread-badge"
          />
        )
      )}
    </Link>
  );
}
