'use client';

import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingSkeleton } from '@/components/ui/ping-skeleton';
import { channelIdFromPath } from '@/lib/channel-url';
import { useErrorMessage } from '@/lib/error-message';
import { PingBadge } from '@/components/ui/ping-badge';
import { prefetchMessages } from '@/features/messages/hooks/use-messages';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { useMobileNav } from '@/features/shell/store';
import { sortedDms } from '../dm-cache';
import { useDms } from '../hooks';
import { dmPath } from '../navigation';

/**
 * Cột trái của vùng DM (TG.9, mục 7 của ADR-0070): danh sách hội thoại sắp theo tin mới nhất,
 * mỗi dòng kèm badge đỏ số tin chưa đọc (mọi tin DM đều mention-style). Dữ liệu cùng cache
 * `qk.dms` với rail nên badge tăng realtime qua `useDmEvents` mà không cần reload.
 *
 * channelId đọc từ URL công khai `/channels/@me/:channelId` (ADR-0088): đây là component layout
 * (như ChannelSidebar), không phải trang — trang lấy params từ props.
 */
export function DmSidebar() {
  const channelId = channelIdFromPath(usePathname()) ?? undefined;
  const { data: dms, isPending, isError, error, refetch, isFetching } = useDms();
  const mobileNavOpen = useMobileNav((state) => state.open);
  const t = useTranslations('dms');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const rows = sortedDms(dms ?? []);

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
        className="flex h-header shrink-0 items-center gap-2 border-b border-sidebar-border px-4"
      >
        <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">{t('title')}</h2>
      </header>
      <nav aria-label={t('navLabel')} className="flex-1 overflow-y-auto p-2 pb-16">
        {isPending ? (
          <div role="status" aria-label={t('loading')} className="flex flex-col gap-2 p-1">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-2">
                <PingSkeleton block className="size-8 rounded-full" />
                <PingSkeleton block className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 p-2 text-sm text-destructive"
          >
            <p>{errorMessage(error)}</p>
            <PingButton
              variant="secondary"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {tc('retry')}
            </PingButton>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul>
            {rows.map((dm) => (
              <DmRow
                key={dm.channelId}
                channelId={dm.channelId}
                name={dm.partner.displayName}
                avatarUrl={dm.partner.avatarUrl}
                unreadCount={dm.channelId === channelId ? 0 : dm.unreadCount}
                active={dm.channelId === channelId}
              />
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}

function DmRow({
  channelId,
  name,
  avatarUrl,
  unreadCount,
  active,
}: {
  channelId: string;
  name: string;
  avatarUrl: string | null;
  unreadCount: number;
  active: boolean;
}) {
  const t = useTranslations('dms');
  const queryClient = useQueryClient();
  const prefetch = () => void prefetchMessages(queryClient, channelId);
  const label =
    unreadCount > 0 ? t('rowLabelUnread', { name, count: unreadCount }) : t('rowLabel', { name });
  return (
    <li>
      <Link
        href={dmPath(channelId)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-testid="dm-row"
        onFocus={prefetch}
        onMouseEnter={prefetch}
        onPointerDown={prefetch}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground transition-colors hover:bg-accent ${
          active ? 'bg-accent' : ''
        }`}
      >
        <UserAvatar name={name} avatarUrl={avatarUrl} size={32} />
        <span
          className={`min-w-0 flex-1 truncate text-base text-sidebar-foreground ${unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}
        >
          {name}
        </span>
        <PingBadge
          count={unreadCount}
          color="red"
          aria-label={t('unreadCount', { count: unreadCount })}
        />
      </Link>
    </li>
  );
}
