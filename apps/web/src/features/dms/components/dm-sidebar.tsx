'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { PingBadge } from '@/components/ui/ping-badge';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { sortedDms } from '../dm-cache';
import { useDms } from '../hooks';
import { dmPath } from '../navigation';

/**
 * Cột trái của vùng DM (TG.9, mục 7 của ADR-0070): danh sách hội thoại sắp theo tin mới nhất,
 * mỗi dòng kèm badge đỏ số tin chưa đọc (mọi tin DM đều mention-style). Dữ liệu cùng cache
 * `qk.dms` với rail nên badge tăng realtime qua `useDmEvents` mà không cần reload.
 *
 * Dùng `useParams()` được theo ADR-0020: đây là component layout (như ChannelSidebar), không
 * phải trang — trang lấy params từ props.
 */
export function DmSidebar() {
  const { channelId } = useParams<{ channelId?: string }>();
  const { data: dms, isPending } = useDms();
  const t = useTranslations('dms');
  const rows = sortedDms(dms ?? []);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-4 shadow-xs">
        <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">{t('title')}</h2>
      </header>
      <nav aria-label={t('navLabel')} className="flex-1 overflow-y-auto p-2">
        {isPending ? (
          <div role="status" aria-label={t('loading')} className="flex flex-col gap-2 p-1">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
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

/** Một hội thoại: avatar đối tác (TG.7), tên, badge đỏ unread. Hàng = link, aria đủ thông tin. */
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
  const label =
    unreadCount > 0 ? t('rowLabelUnread', { name, count: unreadCount }) : t('rowLabel', { name });
  return (
    <li>
      <Link
        href={dmPath(channelId)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-testid="dm-row"
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent ${
          active ? 'bg-accent' : ''
        }`}
      >
        <UserAvatar name={name} avatarUrl={avatarUrl} size="sm" />
        <span
          className={`min-w-0 flex-1 truncate text-sm ${unreadCount > 0 ? 'font-semibold' : ''}`}
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
