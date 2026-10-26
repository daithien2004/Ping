'use client';

import { SmilePlus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { useServerAbility } from '@/features/permissions/context';
import { listReactionUsers } from '../api';
import { useToggleReaction } from '../hooks';
import type { ClientMessage } from '../message-cache';

// Picker nặng (toàn bộ dataset emoji) chỉ tải khi người dùng thực sự mở hộp chọn — không đụng
// bundle ban đầu của kênh chat.
const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((module) => module.EmojiPicker),
  { ssr: false },
);

/**
 * Cảm xúc dưới một tin (TG.2, ADR-0064). Mỗi nhóm là một "viên thuốc" tách đôi: bấm phần emoji để
 * thả/gỡ (optimistic, chờ response chuẩn), bấm phần số để xem ai đã thả (phân trang keyset).
 * Nút thêm mở hộp chọn emoji dùng chung với composer.
 */
export function MessageReactions({
  message,
  channelId,
}: {
  message: ClientMessage;
  channelId: string;
}) {
  const t = useTranslations('messages');
  const tCommon = useTranslations('common');
  const { ability, ready } = useServerAbility();
  const toggle = useToggleReaction(channelId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);
  const reactions = message.reactions ?? [];
  const canReact = ready && ability.can('create', 'Reaction') && message.status === undefined;

  function react(emoji: string, active: boolean) {
    toggle.mutate(
      { messageId: message.id, emoji, active },
      { onError: (error) => pingToast.error(errorMessage(error)) },
    );
  }

  const errorMessage = useErrorMessage();

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="message-reactions">
      {reactions.map((reaction) => (
        <span
          key={reaction.emoji}
          data-testid={`reaction-${reaction.emoji}`}
          data-me={reaction.me ? 'true' : undefined}
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
                ? t('removeReaction', { emoji: reaction.emoji })
                : t('reactWith', { emoji: reaction.emoji })
            }
            aria-pressed={reaction.me}
            title={t('reactWith', { emoji: reaction.emoji })}
            disabled={!canReact || toggle.isPending}
            onClick={() => react(reaction.emoji, !reaction.me)}
            className="px-2 py-0.5 text-sm transition-colors hover:bg-accent/60 disabled:opacity-60"
          >
            {reaction.emoji}
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
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('addReaction')}
          data-testid="add-reaction"
          disabled={toggle.isPending}
          onClick={() => setPickerOpen(true)}
          className="size-6 rounded-full text-muted-foreground"
        >
          <SmilePlus className="size-4" />
        </Button>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent closeLabel={tCommon('close')} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('pickReaction')}</DialogTitle>
          </DialogHeader>
          {pickerOpen && (
            <EmojiPicker
              onPick={(emoji) => {
                setPickerOpen(false);
                const existing = reactions.find((row) => row.emoji === emoji);
                react(emoji, !existing?.me);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ReactorListDialog
        messageId={message.id}
        emoji={reactorEmoji}
        onOpenChange={(open) => setReactorEmoji(open ? reactorEmoji : null)}
      />
    </div>
  );
}

/** Danh sách người đã thả một emoji, tải dần bằng `nextCursor` của API (không phải id user). */
function ReactorListDialog({
  messageId,
  emoji,
  onOpenChange,
}: {
  messageId: string;
  emoji: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('messages');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const query = useInfiniteQuery({
    queryKey: qk.reactionUsers(messageId, emoji ?? ''),
    queryFn: ({ pageParam }) => listReactionUsers(messageId, emoji ?? '', pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: emoji !== null,
  });
  const users = query.data?.pages.flatMap((page) => page.users) ?? [];

  return (
    <Dialog open={emoji !== null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('close')} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('reactorsTitle', { emoji: emoji ?? '' })}</DialogTitle>
        </DialogHeader>
        {query.isPending && emoji !== null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('reactorsLoading')}</p>
        ) : query.isError ? (
          <p className="py-4 text-center text-sm text-destructive">{errorMessage(query.error)}</p>
        ) : users.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('reactorsEmpty')}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {users.map((user) => (
              <li key={user.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                <PingAvatar size="small" src={user.avatarUrl ?? undefined} />
                <span className="font-medium">{user.displayName}</span>
                <span className="text-xs text-muted-foreground">@{user.username}</span>
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('reactorsLoadMore')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
