import { Hash } from 'lucide-react';
import Link from 'next/link';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PingBadge } from '@/components/ui/ping-badge';
import { prefetchMessages } from '@/features/messages/hooks/use-messages';
import { channelPath } from '@/features/servers/navigation';
import { useUnreadChannel } from '@/features/unread/hooks';

/**
 * Một channel trong sidebar kèm badge unread (T4.3): mention > 0 → badge đỏ; unread > 0 →
 * chữ đậm + badge số tin. Kênh đang xem luôn sạch (mark-read chạy khi có tin mới).
 * TG.10: kéo thả được khi người dùng có quyền quản lý channel; hàng là đích thả với đường chỉ.
 */
export function ChannelItem({
  serverId,
  channelId,
  name,
  active,
  slot,
  tabIndex,
  registerSlot,
  onKeyDown,
  onFocus,
  draggable,
  dropBefore,
  dropAfter,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  serverId: string;
  channelId: string;
  name: string;
  active: boolean;
  slot: string;
  tabIndex: number;
  registerSlot: (slot: string) => (element: HTMLElement | null) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onFocus: () => void;
  draggable: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
}): ReactNode {
  const { data: row } = useUnreadChannel(serverId, channelId);
  const unreadCount = active ? 0 : (row?.unreadCount ?? 0);
  const mentionCount = active ? 0 : (row?.mentionCount ?? 0);
  const queryClient = useQueryClient();
  // Hover/focus/bấm xuống là tải trước tin mới nhất (cache còn tươi trong 30s thì prefetch
  // không bắn request): gần như mọi cú chuyển kênh có ý định đều đã có cache sẵn.
  const prefetch = () => void prefetchMessages(queryClient, channelId);

  return (
    <Link
      href={channelPath(serverId, channelId)}
      ref={registerSlot(slot)}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={() => {
        onFocus();
        prefetch();
      }}
      onMouseEnter={prefetch}
      onPointerDown={prefetch}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', name);
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      aria-current={active ? 'page' : undefined}
      // Tên tiếp cận LUÔN ổn định "# tên": số unread nằm trong badge con (có title riêng),
      // không đổi tên link theo trạng thái — trình đọc màn hình và mọi locator không bị
      // "nhảy tên" khi badge xuất hiện/biến mất.
      aria-label={`# ${name}`}
      className={`group flex h-8 items-center gap-2 rounded-md px-2 text-base transition-colors hover:bg-sidebar-accent focus-ring ${
        dropBefore
          ? 'shadow-[inset_0_2px_0_0_var(--sidebar-primary)]'
          : dropAfter
            ? 'shadow-[inset_0_-2px_0_0_var(--sidebar-primary)]'
            : ''
      } ${active ? 'bg-sidebar-accent' : ''}`}
    >
      <Hash className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      {/* Màu ở span con: antd tô <a> bằng rule ngoài layer nên class text-* trên Link bị đè. */}
      <span
        className={`min-w-0 flex-1 truncate ${
          active
            ? 'font-medium text-sidebar-accent-foreground'
            : unreadCount > 0
              ? 'font-semibold text-sidebar-foreground'
              : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
        }`}
      >
        {name}
      </span>
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
