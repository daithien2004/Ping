'use client';

import {
  CUSTOM_EMOJI_REACTION_PATTERN,
  customEmojiReactionToken,
  type CustomEmojiDto,
} from '@ping/shared';
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
import { customEmojiIdFromToken } from '@/features/emojis/emoji-utils';
import { useEmojiMap } from '@/features/emojis/hooks';
import { profileImageUrl } from '@/features/profile/hooks';
import { listReactionUsers } from '../api';
import { useToggleReaction } from '../hooks';
import type { ClientMessage } from '../message-cache';

// Picker nặng (toàn bộ dataset emoji) chỉ tải khi người dùng thực sự mở hộp chọn — không đụng
// bundle ban đầu của kênh chat.
const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((module) => module.EmojiPicker),
  { ssr: false },
);

/** id UUID trong token reaction `c:<id>` (TG.24); không phải token custom → null. */
function customReactionId(emoji: string): string | null {
  return CUSTOM_EMOJI_REACTION_PATTERN.exec(emoji)?.[1] ?? null;
}

/**
 * Nội dung emoji của một pill reaction (TG.24): unicode hiển thị thẳng; token `c:<id>` resolve
 * qua cache server → ảnh 20px, không resolve được (đã xóa/chưa tải) → chữ `c:<8 ký tự cuối>`.
 */
function ReactionEmoji({ emoji, map }: { emoji: string; map: Map<string, CustomEmojiDto> }) {
  const id = customReactionId(emoji);
  if (!id) return <>{emoji}</>;
  const resolved = map.get(id);
  if (!resolved) return <span className="text-xs">c:{id.slice(-8)}</span>;
  return (
    <img
      src={profileImageUrl(resolved.previewUrl || resolved.url)}
      alt={`:${resolved.name}:`}
      title={`:${resolved.name}:`}
      loading="lazy"
      className="h-4 w-4"
    />
  );
}

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
  const { ability, ready, serverId } = useServerAbility();
  const toggle = useToggleReaction(channelId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);
  const reactions = message.reactions ?? [];
  const canReact = ready && ability.can('create', 'Reaction') && message.status === undefined;
  // TG.24: map id → emoji server để render token `c:<id>` trong pill và nhãn dialog.
  const emojiMap = useEmojiMap(serverId);
  // Nhãn hiển thị/aria: emoji unicode giữ nguyên; token custom → `:ten:` hoặc rút gọn.
  const reactionLabel = (emoji: string): string => {
    const id = customReactionId(emoji);
    if (!id) return emoji;
    const name = emojiMap.get(id)?.name;
    return name ? `:${name}:` : `c:${id.slice(-8)}`;
  };

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
                ? t('removeReaction', { emoji: reactionLabel(reaction.emoji) })
                : t('reactWith', { emoji: reactionLabel(reaction.emoji) })
            }
            aria-pressed={reaction.me}
            title={t('reactWith', { emoji: reactionLabel(reaction.emoji) })}
            disabled={!canReact || toggle.isPending}
            onClick={() => react(reaction.emoji, !reaction.me)}
            className="px-2 py-0.5 text-sm transition-colors hover:bg-accent/60 disabled:opacity-60"
          >
            <ReactionEmoji emoji={reaction.emoji} map={emojiMap} />
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
              serverId={serverId}
              onPick={(emoji) => {
                setPickerOpen(false);
                const existing = reactions.find((row) => row.emoji === emoji);
                react(emoji, !existing?.me);
              }}
              onPickCustom={(token) => {
                // TG.24: picker trả token đầy đủ `:ten:<id>` — reaction lưu dạng gọn `c:<id>`
                // (reactionTokenSchema shared chấp nhận; API kiểm emoji thuộc server của tin).
                setPickerOpen(false);
                const id = customEmojiIdFromToken(token);
                if (!id) return;
                const emoji = customEmojiReactionToken(id);
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
        emojiLabel={reactorEmoji ? reactionLabel(reactorEmoji) : ''}
        onOpenChange={(open) => setReactorEmoji(open ? reactorEmoji : null)}
      />
    </div>
  );
}

/** Danh sách người đã thả một emoji, tải dần bằng `nextCursor` của API (không phải id user). */
function ReactorListDialog({
  messageId,
  emoji,
  emojiLabel,
  onOpenChange,
}: {
  messageId: string;
  emoji: string | null;
  /** Nhãn hiển thị trong tiêu đề (TG.24: token `c:<id>` → `:ten:`/rút gọn, không để uuid lộ). */
  emojiLabel: string;
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
          <DialogTitle>{t('reactorsTitle', { emoji: emojiLabel })}</DialogTitle>
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
