'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useMe } from '@/features/auth/hooks';
import { useServerAbility } from '@/features/permissions/context';
import {
  readCollapsedCategories,
  toggleCollapsed,
  writeCollapsedCategories,
} from '../../collapsed-categories';
import { useCategories, useChannels } from '../../hooks';
import { groupChannels } from '../../sidebar-model';
import { CreateChannelAction } from '../create-channel-action';
import { ChannelGroup } from './channel-group';
import { DEFAULT_GROUP_KEY, useChannelSidebarDnd } from './use-channel-sidebar-dnd';

export function ChannelNavigation({ serverId, activeId }: { serverId: string; activeId?: string }) {
  const { data: channels } = useChannels(serverId);
  const categories = useCategories(serverId);
  const { data: me } = useMe();
  const { ability } = useServerAbility();
  const t = useTranslations('channels');
  const canManage = ability.can('manage', 'Channel');
  const groups = groupChannels(channels, categories, t('defaultGroup'));

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

  const dnd = useChannelSidebarDnd({
    serverId,
    channels,
    categories,
    groups,
    collapsed,
    userId: me?.id,
  });
  const channelSidebarEmpty = channels.length === 0 && !canManage;

  return (
    <nav
      aria-label={t('navLabel')}
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pb-16"
    >
      {channelSidebarEmpty && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {channels.length === 0 && canManage && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('emptyManage')}</p>
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
            dragging={dnd.dragKind}
            tabIndexFor={dnd.tabIndexFor}
            registerSlot={dnd.registerSlot}
            onKeyDown={dnd.handleKeyDown}
            onFocus={dnd.setFocusSlot}
            dropLine={dnd.dropLine}
            headerDropHighlight={
              dnd.dropTarget?.slot === `cat:${slotKey}` && dnd.dragKind === 'channel'
            }
            onChannelDragStart={dnd.onChannelDragStart}
            onCategoryDragStart={() => dnd.onCategoryDragStart(group.categoryId)}
            onChannelDragOver={dnd.onChannelDragOver}
            onChannelDrop={dnd.onChannelDrop}
            onCategoryDragOver={dnd.onCategoryDragOver}
            onCategoryDrop={dnd.onCategoryDrop}
            onEndZoneDragOver={() => dnd.onEndZoneDragOver(slotKey)}
            onEndZoneDrop={() => dnd.onEndZoneDrop(group.categoryId)}
            onDragEnd={dnd.onDragEnd}
          />
        );
      })}
      <CreateChannelAction serverId={serverId} />
    </nav>
  );
}
