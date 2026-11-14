'use client';

import { customEmojiReactionToken } from '@ping/shared';
import { Link2, MoreHorizontal, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { AnchoredPopover } from '@/components/ui/anchored-popover';
import { PingDropdown } from '@/components/ui/ping-dropdown';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { pingToast } from '@/components/ui/ping-toast';
import {
  recentEmojiSnapshot,
  rememberEmoji,
  serverRecentEmojiSnapshot,
  subscribeRecentEmoji,
} from '@/features/emoji/recent';
import { preloadEmojiPicker } from '@/features/emoji/preload';
import { customEmojiIdFromToken } from '@/features/emojis/emoji-utils';
import { useServerAbility } from '@/features/permissions/context';
import { messageSubject } from '@/features/permissions/ability';
import { useErrorMessage } from '@/lib/error-message';
import type { ClientMessage } from '../message-cache';
import { useSetPinned, useToggleReaction } from '../hooks';

const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((module) => module.EmojiPicker),
  { ssr: false },
);

export interface MessageSelection {
  kind: 'edit' | 'delete';
  messageId: string;
}

const QUICK_FALLBACK = ['👍', '❤️', '😂'];
const QUICK_COUNT = 3;

export function MessageActions({
  message,
  channelId,
  permalink,
  onAction,
  onReply,
  onOverlayOpenChange,
}: {
  message: ClientMessage;
  channelId: string;
  permalink: string;
  onAction: (selection: MessageSelection) => void;
  onReply: (message: ClientMessage) => void;
  onOverlayOpenChange: (open: boolean) => void;
}) {
  const { ability, ready, serverId: scopeServerId } = useServerAbility();
  const t = useTranslations('messages');
  const errorMessage = useErrorMessage();
  const setPinned = useSetPinned(channelId);
  const toggle = useToggleReaction(channelId);
  const [pickerOpen, setPickerOpenState] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function reportOverlay(picker: boolean, menu: boolean) {
    onOverlayOpenChange(picker || menu);
  }
  function setPickerOpen(open: boolean) {
    setPickerOpenState(open);
    reportOverlay(open, menuOpen);
  }
  function setMenu(open: boolean) {
    setMenuOpen(open);
    reportOverlay(pickerOpen, open);
  }
  const recent = useSyncExternalStore(
    subscribeRecentEmoji,
    recentEmojiSnapshot,
    serverRecentEmojiSnapshot,
  );
  const quick = [...recent.slice(0, QUICK_COUNT), ...QUICK_FALLBACK]
    .filter((emoji, index, all) => all.indexOf(emoji) === index)
    .slice(0, QUICK_COUNT);
  const serverId = scopeServerId ?? undefined;
  const target = messageSubject(message);
  const canEdit = ability.can('update', target);
  const canDelete = ability.can('delete', target);
  const canReply = ability.can('create', 'Message');
  const canPin = ability.can('create', 'Pin');
  const canReact = ability.can('create', 'Reaction');
  if (message.status) return null;
  const myReactions = new Set(
    (message.reactions ?? []).filter((row) => row.me).map((row) => row.emoji),
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(permalink, window.location.origin).toString());
      pingToast.success(t('linkCopied'));
    } catch {
      pingToast.error(t('linkCopyFailed'));
    }
  }

  function react(emoji: string, remember: boolean) {
    if (remember) rememberEmoji(emoji);
    toggle.mutate(
      { messageId: message.id, emoji, active: !myReactions.has(emoji) },
      { onError: (error) => pingToast.error(errorMessage(error)) },
    );
  }

  function reactFromPicker(emoji: string, remember: boolean) {
    setPickerOpen(false);
    react(emoji, remember);
  }

  return (
    <>
      {canReact && (
        <div
          className="flex items-center gap-0.5"
          data-testid="quick-reactions"
          onPointerEnter={() => void preloadEmojiPicker()}
          onFocusCapture={() => void preloadEmojiPicker()}
        >
          <PingIconButton
            ref={triggerRef}
            icon={<SmilePlus className="size-4" />}
            aria-label={t('addReaction')}
            aria-expanded={pickerOpen}
            className={pickerOpen ? 'bg-accent text-foreground' : undefined}
            data-testid="add-reaction"
            disabled={!ready}
            onClick={() => setPickerOpen(!pickerOpen)}
          />
          {pickerOpen && (
            <AnchoredPopover anchorRef={triggerRef} onDismiss={() => setPickerOpen(false)}>
              <EmojiPicker
                serverId={serverId}
                onPick={(emoji) => reactFromPicker(emoji, true)}
                onPickCustom={(token) => {
                  const id = customEmojiIdFromToken(token);
                  if (!id) return setPickerOpen(false);
                  reactFromPicker(customEmojiReactionToken(id), false);
                }}
              />
            </AnchoredPopover>
          )}
          {quick.map((emoji) => {
            const active = myReactions.has(emoji);
            return (
              <PingIconButton
                key={emoji}
                icon={<span className="text-base leading-none">{emoji}</span>}
                aria-label={active ? t('removeReaction', { emoji }) : t('reactWith', { emoji })}
                aria-pressed={active}
                className={active ? 'bg-primary/15' : undefined}
                data-testid={`quick-reaction-${emoji}`}
                disabled={!ready || toggle.isPending}
                onClick={() => react(emoji, true)}
              />
            );
          })}
        </div>
      )}
      {canReply && (
        <PingIconButton
          icon={<Reply className="size-4" />}
          aria-label={t('reply')}
          disabled={!ready}
          onClick={() => onReply(message)}
        />
      )}
      <PingDropdown
        trigger={['click']}
        placement="bottomRight"
        onOpenChange={setMenu}
        menu={{
          items: [
            {
              key: 'copy-link',
              label: t('copyLink'),
              icon: <Link2 />,
              'data-testid': 'copy-link',
              onClick: () => void copyLink(),
            },
            ...(canEdit
              ? [
                  {
                    key: 'edit',
                    label: t('edit'),
                    icon: <Pencil />,
                    onClick: () => onAction({ kind: 'edit', messageId: message.id }),
                  },
                ]
              : []),
            ...(canPin
              ? [
                  {
                    key: 'pin',
                    label: message.pinnedAt ? t('unpin') : t('pin'),
                    icon: message.pinnedAt ? <PinOff /> : <Pin />,
                    'data-testid': message.pinnedAt ? 'unpin' : 'pin',
                    disabled: !ready || setPinned.isPending,
                    onClick: () =>
                      setPinned.mutate({ messageId: message.id, pin: !message.pinnedAt }),
                  },
                ]
              : []),
            ...(canDelete
              ? [
                  {
                    key: 'delete',
                    label: t('delete'),
                    icon: <Trash2 />,
                    onClick: () => onAction({ kind: 'delete', messageId: message.id }),
                  },
                ]
              : []),
          ],
        }}
      >
        <PingIconButton icon={<MoreHorizontal />} aria-label={t('actions')} disabled={!ready} />
      </PingDropdown>
    </>
  );
}
