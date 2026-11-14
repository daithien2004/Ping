'use client';

import type { ChannelCategoryDto, ChannelDto } from '@ping/shared';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useMoveChannel, useReorderCategories, useUpdateChannelPositions } from '../../hooks';
import {
  keyboardChannelMove,
  planChannelMove,
  reorderedCategoryIds,
  reorderCategoryTo,
  sortCategories,
  type SidebarGroup,
} from '../../sidebar-model';

export const DEFAULT_GROUP_KEY = '__default';

interface DragPayload {
  kind: 'channel' | 'category';
  id: string;
}

interface DropTarget {
  slot: string;
  edge: 'before' | 'after';
}

export function useChannelSidebarDnd({
  serverId,
  channels,
  categories,
  groups,
  collapsed,
}: {
  serverId: string;
  channels: ChannelDto[];
  categories: ChannelCategoryDto[];
  groups: SidebarGroup[];
  collapsed: string[];
  userId: string | undefined;
}) {
  const errorMessage = useErrorMessage();
  const moveMutation = useMoveChannel(serverId);
  const positionsMutation = useUpdateChannelPositions(serverId);
  const reorderMutation = useReorderCategories(serverId);
  const onMoveError = (error: unknown) => pingToast.error(errorMessage(error));

  // Payload giữ trong ref vì dataTransfer.getData chỉ đọc được ở drop.
  const dragRef = useRef<DragPayload | null>(null);
  const [dragKind, setDragKind] = useState<'channel' | 'category' | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function clearDrag() {
    dragRef.current = null;
    setDragKind(null);
    setDropTarget(null);
  }

  function moveChannelTo(channelId: string, categoryId: string | null, index: number) {
    const plan = planChannelMove(channels, channelId, categoryId, index);
    if (!plan) return;
    if (plan.kind === 'move')
      moveMutation.mutate({ channelId, input: plan.input }, { onError: onMoveError });
    else positionsMutation.mutate(plan.updates, { onError: onMoveError });
  }

  function moveCategoryTo(categoryId: string, insertIndex: number) {
    const orderedIds = reorderCategoryTo(categories, categoryId, insertIndex);
    if (orderedIds) reorderMutation.mutate(orderedIds, { onError: onMoveError });
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
    if (payload.kind === 'channel') {
      moveChannelTo(payload.id, categoryId, Number.MAX_SAFE_INTEGER);
      return;
    }
    if (categoryId === null || payload.id === categoryId) return;
    const baseIndex = sortCategories(categories)
      .map((category) => category.id)
      .filter((id) => id !== payload.id)
      .indexOf(categoryId);
    if (baseIndex < 0) return;
    moveCategoryTo(payload.id, edge === 'after' ? baseIndex + 1 : baseIndex);
  }

  function onEndZoneDrop(categoryId: string | null) {
    const payload = dragRef.current;
    clearDrag();
    if (payload?.kind === 'channel') moveChannelTo(payload.id, categoryId, Number.MAX_SAFE_INTEGER);
  }

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
      if (current.startsWith('ch:')) {
        const channelId = current.slice(3);
        const target = keyboardChannelMove(channels, categories, channelId, direction);
        if (!target) return;
        const plan = planChannelMove(channels, channelId, target.categoryId, target.index);
        if (!plan) return;
        pendingFocus.current = current;
        if (plan.kind === 'move')
          moveMutation.mutate({ channelId, input: plan.input }, { onError: onMoveError });
        else positionsMutation.mutate(plan.updates, { onError: onMoveError });
        return;
      }
      const key = current.slice(4);
      if (key === DEFAULT_GROUP_KEY) return;
      const orderedIds = reorderedCategoryIds(categories, key, direction);
      if (orderedIds) {
        pendingFocus.current = current;
        reorderMutation.mutate(orderedIds, { onError: onMoveError });
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

  const dropLine = (slot: string, edge: 'before' | 'after') =>
    dropTarget?.slot === slot && dropTarget.edge === edge;

  return {
    dragKind,
    dropTarget,
    dropLine,
    tabIndexFor,
    registerSlot,
    handleKeyDown,
    setFocusSlot,
    onChannelDragStart: (channelId: string) => {
      dragRef.current = { kind: 'channel', id: channelId };
      setDragKind('channel');
    },
    onCategoryDragStart: (categoryId: string | null) => {
      if (categoryId === null) return;
      dragRef.current = { kind: 'category', id: categoryId };
      setDragKind('category');
    },
    onChannelDragOver: channelDragOver,
    onChannelDrop: channelDrop,
    onCategoryDragOver: categoryDragOver,
    onCategoryDrop: categoryDrop,
    onEndZoneDragOver: (slotKey: string) =>
      setDropTarget({ slot: `end:${slotKey}`, edge: 'after' }),
    onEndZoneDrop,
    onDragEnd: clearDrag,
  };
}
