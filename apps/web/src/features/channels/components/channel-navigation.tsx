'use client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { PingBadge } from '@/components/ui/ping-badge';
import { useMe } from '@/features/auth/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { channelPath } from '@/features/servers/navigation';
import { useUnread } from '@/features/unread/hooks';
import {
  readCollapsedCategories,
  toggleCollapsed,
  writeCollapsedCategories,
} from '../collapsed-categories';
import {
  useCategories,
  useChannels,
  useMoveChannel,
  useReorderCategories,
  useUpdateChannelPositions,
} from '../hooks';
import {
  groupChannels,
  keyboardChannelMove,
  planChannelMove,
  reorderedCategoryIds,
  reorderCategoryTo,
  sortCategories,
} from '../sidebar-model';
import type { SidebarGroup } from '../sidebar-model';
import { CreateChannelAction } from './create-channel-action';

/** Vùng mặc định (channel ngoài category) dùng sentinel riêng trong localStorage. */
const DEFAULT_GROUP_KEY = '__default';

interface DragPayload {
  kind: 'channel' | 'category';
  id: string;
}

/** Ô đang là đích thả: đường chỉ màu accent vẽ trên/dưới hàng (`edge`). */
interface DropTarget {
  slot: string;
  edge: 'before' | 'after';
}

/**
 * Thanh điều hướng channel nhóm theo category (TG.10): header thu gọn được (lưu localStorage
 * theo user+server), kéo thả channel/category bằng HTML5 DnD thuần (không thêm dependency),
 * và bàn phím — ArrowUp/Down di focus giữa các hàng (roving tabindex), Alt+ArrowUp/Down di
 * chuyển channel/category (gọi cùng API với kéo thả, rankBetween cho hàng xóm sau khi sort).
 */
export function ChannelNavigation({ serverId, activeId }: { serverId: string; activeId?: string }) {
  const { data: channels } = useChannels(serverId);
  const categories = useCategories(serverId);
  const { data: me } = useMe();
  const { ability } = useServerAbility();
  const moveMutation = useMoveChannel(serverId);
  const positionsMutation = useUpdateChannelPositions(serverId);
  const reorderMutation = useReorderCategories(serverId);
  const t = useTranslations('channels');
  const canManage = ability.can('manage', 'Channel');

  // Trạng thái thu gọn đọc MỘT lần cho cặp (user, server) — đổi server/user thì nạp lại.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!me) return;
    const key = `${me.id}:${serverId}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setCollapsed(readCollapsedCategories(me.id, serverId));
  }, [me, serverId]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = toggleCollapsed(prev, key);
      if (me) writeCollapsedCategories(me.id, serverId, next);
      return next;
    });
  }

  const groups = groupChannels(channels, categories, t('defaultGroup'));

  // --- Kéo thả (HTML5 DnD): payload giữ trong ref vì dataTransfer.getData chỉ đọc được ở drop.
  const dragRef = useRef<DragPayload | null>(null);
  const [dragKind, setDragKind] = useState<'channel' | 'category' | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function clearDrag() {
    dragRef.current = null;
    setDragKind(null);
    setDropTarget(null);
  }

  /** Thả channel vào `categoryId` tại `index` trong nhóm đích — cùng một đường với bàn phím. */
  function moveChannelTo(channelId: string, categoryId: string | null, index: number) {
    const plan = planChannelMove(channels, channelId, categoryId, index);
    if (!plan) return;
    if (plan.kind === 'move') moveMutation.mutate({ channelId, input: plan.input });
    else positionsMutation.mutate(plan.updates);
  }

  function moveCategoryTo(categoryId: string, insertIndex: number) {
    const orderedIds = reorderCategoryTo(categories, categoryId, insertIndex);
    if (orderedIds) reorderMutation.mutate(orderedIds);
  }

  function channelDragOver(event: DragEvent, channelId: string) {
    if (dragRef.current?.kind !== 'channel') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      slot: `ch:${channelId}`,
      edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
    });
  }

  function channelDrop(event: DragEvent, group: SidebarGroup, index: number, channelId: string) {
    event.preventDefault();
    const payload = dragRef.current;
    // Đọc edge TRƯỚC khi clear — state dropTarget được cập nhật liên tục trong dragover.
    const edge = dropTarget?.slot === `ch:${channelId}` ? dropTarget.edge : 'before';
    clearDrag();
    if (payload?.kind !== 'channel') return;
    moveChannelTo(payload.id, group.categoryId, edge === 'before' ? index : index + 1);
  }

  function categoryDragOver(event: DragEvent, categoryId: string | null) {
    if (!dragRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ slot: `cat:${categoryId ?? DEFAULT_GROUP_KEY}`, edge });
  }

  function categoryDrop(event: DragEvent, categoryId: string | null) {
    event.preventDefault();
    const payload = dragRef.current;
    const key = categoryId ?? DEFAULT_GROUP_KEY;
    const edge = dropTarget?.slot === `cat:${key}` ? dropTarget.edge : 'before';
    clearDrag();
    if (!payload) return;
    // Thả channel lên header: vào CUỐI nhóm đó (chỉ số lớn hơn chiều dài được model kẹp lại).
    if (payload.kind === 'channel') {
      moveChannelTo(payload.id, categoryId, Number.MAX_SAFE_INTEGER);
      return;
    }
    // Kéo category: trước/sau header đích; vùng mặc định không phải category — bỏ qua.
    if (categoryId === null || payload.id === categoryId) return;
    const baseIndex = sortCategories(categories)
      .map((category) => category.id)
      .filter((id) => id !== payload.id)
      .indexOf(categoryId);
    if (baseIndex < 0) return;
    moveCategoryTo(payload.id, edge === 'after' ? baseIndex + 1 : baseIndex);
  }

  // --- Bàn phím: roving tabindex + Alt+Arrow di chuyển (a11y TG.10).
  const slots = groups.flatMap((group) => {
    const key = group.categoryId ?? DEFAULT_GROUP_KEY;
    const headerSlot = `cat:${key}`;
    return collapsed.includes(key)
      ? [headerSlot]
      : [headerSlot, ...group.channels.map((channel) => `ch:${channel.id}`)];
  });
  const [focusSlot, setFocusSlot] = useState<string | null>(null);
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  // Alt+Arrow làm channel/category đổi node DOM (đổi nhóm) — focus lại sau khi render xong.
  useEffect(() => {
    if (!pendingFocus.current) return;
    slotRefs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const registerSlot = (slot: string) => (element: HTMLElement | null) => {
    if (element) slotRefs.current.set(slot, element);
    else slotRefs.current.delete(slot);
  };

  const tabIndexFor = (slot: string) =>
    focusSlot === slot || (focusSlot === null && slots[0] === slot) ? 0 : -1;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const current = focusSlot ?? slots[0];
    if (!current) return;
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    if (event.altKey) {
      // Alt+Arrow: di chuyển channel/category theo nghĩa thứ tự, giữ nguyên focus.
      if (current.startsWith('ch:')) {
        const channelId = current.slice(3);
        const target = keyboardChannelMove(channels, categories, channelId, direction);
        if (!target) return;
        const plan = planChannelMove(channels, channelId, target.categoryId, target.index);
        if (!plan) return;
        pendingFocus.current = current;
        if (plan.kind === 'move') moveMutation.mutate({ channelId, input: plan.input });
        else positionsMutation.mutate(plan.updates);
        return;
      }
      const key = current.slice(4);
      if (key === DEFAULT_GROUP_KEY) return;
      const orderedIds = reorderedCategoryIds(categories, key, direction);
      if (orderedIds) {
        pendingFocus.current = current;
        reorderMutation.mutate(orderedIds);
      }
      return;
    }
    const index = slots.indexOf(current);
    const next =
      slots[Math.max(0, Math.min(index + (direction === 'up' ? -1 : 1), slots.length - 1))];
    if (next) {
      setFocusSlot(next);
      slotRefs.current.get(next)?.focus();
    }
  }

  const channelSidebarEmpty = channels.length === 0 && !canManage;
  const dropLine = (slot: string, edge: 'before' | 'after') =>
    dropTarget?.slot === slot && dropTarget.edge === edge;

  return (
    <nav aria-label={t('navLabel')} className="flex flex-col gap-0.5 p-2">
      {channelSidebarEmpty && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {groups.map((group) => {
        const slotKey = group.categoryId ?? DEFAULT_GROUP_KEY;
        return (
          <ChannelGroup
            key={slotKey}
            group={group}
            slotKey={slotKey}
            serverId={serverId}
            activeId={activeId}
            collapsed={collapsed.includes(slotKey)}
            onToggle={() => toggle(slotKey)}
            canManage={canManage}
            dragging={dragKind}
            tabIndexFor={tabIndexFor}
            registerSlot={registerSlot}
            onKeyDown={handleKeyDown}
            onFocus={setFocusSlot}
            dropLine={dropLine}
            headerDropHighlight={dropTarget?.slot === `cat:${slotKey}` && dragKind === 'channel'}
            onChannelDragStart={(channelId) => {
              dragRef.current = { kind: 'channel', id: channelId };
              setDragKind('channel');
            }}
            onCategoryDragStart={() => {
              if (group.categoryId === null) return;
              dragRef.current = { kind: 'category', id: group.categoryId };
              setDragKind('category');
            }}
            onChannelDragOver={channelDragOver}
            onChannelDrop={channelDrop}
            onCategoryDragOver={categoryDragOver}
            onCategoryDrop={categoryDrop}
            onEndZoneDragOver={() => setDropTarget({ slot: `end:${slotKey}`, edge: 'after' })}
            onEndZoneDrop={() => {
              const payload = dragRef.current;
              clearDrag();
              if (payload?.kind === 'channel')
                moveChannelTo(payload.id, group.categoryId, Number.MAX_SAFE_INTEGER);
            }}
            onDragEnd={clearDrag}
          />
        );
      })}
      <CreateChannelAction serverId={serverId} />
    </nav>
  );
}

interface ChannelGroupProps {
  group: SidebarGroup;
  slotKey: string;
  serverId: string;
  activeId?: string;
  collapsed: boolean;
  onToggle: () => void;
  canManage: boolean;
  dragging: 'channel' | 'category' | null;
  tabIndexFor: (slot: string) => number;
  registerSlot: (slot: string) => (element: HTMLElement | null) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onFocus: (slot: string) => void;
  dropLine: (slot: string, edge: 'before' | 'after') => boolean;
  headerDropHighlight: boolean;
  onChannelDragStart: (channelId: string) => void;
  onCategoryDragStart: () => void;
  onChannelDragOver: (event: DragEvent, channelId: string) => void;
  onChannelDrop: (event: DragEvent, group: SidebarGroup, index: number, channelId: string) => void;
  onCategoryDragOver: (event: DragEvent, categoryId: string | null) => void;
  onCategoryDrop: (event: DragEvent, categoryId: string | null) => void;
  onEndZoneDragOver: () => void;
  onEndZoneDrop: () => void;
  onDragEnd: () => void;
}

/**
 * Một nhóm sidebar: header (thu gọn được, aria-expanded) + danh sách channel + vùng thả nối
 * cuối khi đang kéo channel. Vùng mặc định (categoryId null) không kéo được header nhưng vẫn
 * nhận channel thả vào; header của nó LUÔN hiện, không xóa được (plan TG.10).
 */
function ChannelGroup(props: ChannelGroupProps) {
  const {
    group,
    slotKey,
    serverId,
    activeId,
    collapsed,
    onToggle,
    canManage,
    dragging,
    tabIndexFor,
    registerSlot,
    dropLine,
    headerDropHighlight,
    onKeyDown,
    onFocus,
  } = props;
  const headerSlot = `cat:${slotKey}`;
  const listId = `category-list-${slotKey}`;
  const headerLine = dropLine(headerSlot, 'before')
    ? 'shadow-[inset_0_2px_0_0_var(--sidebar-primary)]'
    : dropLine(headerSlot, 'after')
      ? 'shadow-[inset_0_-2px_0_0_var(--sidebar-primary)]'
      : '';

  return (
    <section className="flex flex-col">
      <button
        type="button"
        id={`category-header-${slotKey}`}
        ref={registerSlot(headerSlot)}
        tabIndex={tabIndexFor(headerSlot)}
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : listId}
        data-testid="category-header"
        data-category={slotKey}
        onKeyDown={onKeyDown}
        onFocus={() => onFocus(headerSlot)}
        draggable={canManage && group.categoryId !== null}
        onDragStart={(event) => {
          if (!canManage || group.categoryId === null) return;
          event.dataTransfer.effectAllowed = 'move';
          // text/plain để Firefox chịu bắt đầu drag; dữ liệu thật nằm trong dragRef.
          event.dataTransfer.setData('text/plain', group.name);
          props.onCategoryDragStart();
        }}
        onDragOver={(event) => props.onCategoryDragOver(event, group.categoryId)}
        onDrop={(event) => props.onCategoryDrop(event, group.categoryId)}
        onDragEnd={props.onDragEnd}
        onClick={onToggle}
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 ${
          headerDropHighlight ? 'bg-sidebar-accent text-sidebar-accent-foreground' : headerLine
        }`}
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
      </button>
      {!collapsed && (
        <ul
          id={listId}
          aria-labelledby={`category-header-${slotKey}`}
          className="flex flex-col gap-0.5"
        >
          {group.channels.map((channel, index) => (
            <li key={channel.id}>
              <ChannelItem
                serverId={serverId}
                channelId={channel.id}
                name={channel.name}
                active={channel.id === activeId}
                slot={`ch:${channel.id}`}
                tabIndex={tabIndexFor(`ch:${channel.id}`)}
                registerSlot={registerSlot}
                onKeyDown={onKeyDown}
                onFocus={() => onFocus(`ch:${channel.id}`)}
                draggable={canManage}
                dropBefore={dropLine(`ch:${channel.id}`, 'before')}
                dropAfter={dropLine(`ch:${channel.id}`, 'after')}
                onDragStart={() => props.onChannelDragStart(channel.id)}
                onDragOver={(event) => props.onChannelDragOver(event, channel.id)}
                onDrop={(event) => props.onChannelDrop(event, group, index, channel.id)}
                onDragEnd={props.onDragEnd}
              />
            </li>
          ))}
        </ul>
      )}
      {canManage && dragging === 'channel' && !collapsed && (
        <div
          aria-hidden
          data-testid={`drop-end-${slotKey}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            props.onEndZoneDragOver();
          }}
          onDrop={(event) => {
            event.preventDefault();
            props.onEndZoneDrop();
          }}
          className={`h-4 rounded-md ${
            dropLine(`end:${slotKey}`, 'after')
              ? 'shadow-[inset_0_2px_0_0_var(--sidebar-primary)]'
              : ''
          }`}
        />
      )}
    </section>
  );
}

/**
 * Một channel trong sidebar kèm badge unread (T4.3): mention > 0 → badge đỏ; unread > 0 →
 * chữ đậm + badge số tin. Kênh đang xem luôn sạch (mark-read chạy khi có tin mới).
 * TG.10: kéo thả được khi người dùng có quyền quản lý channel; hàng là đích thả với đường chỉ.
 */
function ChannelItem({
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
  const { data: unread } = useUnread(serverId);
  const row = unread?.find((item) => item.channelId === channelId);
  const unreadCount = active ? 0 : (row?.unreadCount ?? 0);
  const mentionCount = active ? 0 : (row?.mentionCount ?? 0);

  return (
    <Link
      href={channelPath(serverId, channelId)}
      ref={registerSlot(slot)}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
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
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 ${
        dropBefore
          ? 'shadow-[inset_0_2px_0_0_var(--sidebar-primary)]'
          : dropAfter
            ? 'shadow-[inset_0_-2px_0_0_var(--sidebar-primary)]'
            : ''
      } ${
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
