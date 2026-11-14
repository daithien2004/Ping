import type { DragEvent, KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SidebarGroup } from '../../sidebar-model';
import { ChannelItem } from './channel-item';

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

export function ChannelGroup(props: ChannelGroupProps) {
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
    <section className="mt-4 flex flex-col first:mt-0">
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
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-ring ${
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
