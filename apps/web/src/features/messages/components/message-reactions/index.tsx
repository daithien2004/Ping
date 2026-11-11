'use client';

import { customEmojiReactionToken } from '@ping/shared';
import { SmilePlus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingModal } from '@/components/ui/ping-modal';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useServerAbility } from '@/features/permissions/context';
import { customEmojiIdFromToken } from '@/features/emojis/emoji-utils';
import { useEmojiMap } from '@/features/emojis/hooks';
import { useToggleReaction } from '../../hooks';
import type { ClientMessage } from '../../message-cache';
import { customReactionId, reactionLabel as buildReactionLabel } from '../../reaction-label';
import { ReactionEmoji } from './reaction-emoji';
import { ReactorListDialog } from './reactor-list-dialog';

const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((module) => module.EmojiPicker),
  { ssr: false },
);

export function MessageReactions({
  message,
  channelId,
}: {
  message: ClientMessage;
  channelId: string;
}) {
  const t = useTranslations('messages');
  const errorMessage = useErrorMessage();
  const { ability, ready, serverId } = useServerAbility();
  const toggle = useToggleReaction(channelId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);
  const reactions = message.reactions ?? [];
  const canReact = ready && ability.can('create', 'Reaction') && message.status === undefined;
  const emojiMap = useEmojiMap(serverId);
  const deletedLabel = t('reactionDeleted');
  const reactionLabel = (emoji: string): string => {
    const id = customReactionId(emoji);
    return buildReactionLabel({
      emoji,
      resolvedName: id ? emojiMap.get(id)?.name : undefined,
      emojiName: reactions.find((row) => row.emoji === emoji)?.emojiName,
      deletedLabel,
    });
  };

  function react(emoji: string, active: boolean) {
    toggle.mutate(
      { messageId: message.id, emoji, active },
      { onError: (error) => pingToast.error(errorMessage(error)) },
    );
  }

  function toggleFromPicker(emoji: string) {
    setPickerOpen(false);
    react(emoji, !reactions.find((row) => row.emoji === emoji)?.me);
  }

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1"
      data-slot="reactions"
      data-testid="message-reactions"
    >
      {reactions.map((reaction) => (
        <span
          key={reaction.emoji}
          data-testid={`reaction-${reaction.emoji}`}
          data-me={reaction.me ? 'true' : undefined}
          data-slot="reaction"
          className={`inline-flex items-center overflow-hidden rounded-full border text-xs ${
            reaction.me
              ? 'border-primary/60 bg-primary/15 text-foreground'
              : 'border-border bg-muted/60 text-muted-foreground'
          }`}
        >
          <button
            type="button"
            aria-label={
              reaction.me
                ? t('removeReaction', { emoji: reactionLabel(reaction.emoji) })
                : t('reactWith', { emoji: reactionLabel(reaction.emoji) })
            }
            aria-pressed={reaction.me}
            title={t('reactWith', { emoji: reactionLabel(reaction.emoji) })}
            disabled={!canReact || toggle.isPending}
            onClick={() => react(reaction.emoji, !reaction.me)}
            className="px-2 py-0.5 text-sm transition-colors hover:bg-accent/60 disabled:opacity-60"
          >
            <ReactionEmoji
              emoji={reaction.emoji}
              emojiName={reaction.emojiName}
              map={emojiMap}
              deletedLabel={deletedLabel}
            />
          </button>
          <button
            type="button"
            aria-label={t('viewReactors', { count: reaction.count })}
            title={t('viewReactors', { count: reaction.count })}
            onClick={() => setReactorEmoji(reaction.emoji)}
            className="border-l border-border/60 px-1.5 py-0.5 font-medium transition-colors hover:bg-accent/60"
          >
            {reaction.count}
          </button>
        </span>
      ))}
      {canReact && (
        <PingIconButton
          icon={<SmilePlus className="size-4" />}
          aria-label={t('addReaction')}
          data-testid="add-reaction"
          disabled={toggle.isPending}
          onClick={() => setPickerOpen(true)}
          className="size-6"
        />
      )}

      <PingModal
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        title={t('pickReaction')}
        footer={null}
        destroyOnHidden
      >
        {pickerOpen && (
          <EmojiPicker
            serverId={serverId}
            onPick={toggleFromPicker}
            onPickCustom={(token) => {
              const id = customEmojiIdFromToken(token);
              if (!id) return setPickerOpen(false);
              toggleFromPicker(customEmojiReactionToken(id));
            }}
          />
        )}
      </PingModal>

      <ReactorListDialog
        messageId={message.id}
        emoji={reactorEmoji}
        emojiLabel={reactorEmoji ? reactionLabel(reactorEmoji) : ''}
        onOpenChange={(open) => setReactorEmoji(open ? reactorEmoji : null)}
      />
    </div>
  );
}
