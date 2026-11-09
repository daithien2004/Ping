'use client';

import { customEmojiReactionToken, type CustomEmojiDto } from '@ping/shared';
import { ImageOff, SmilePlus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { PingButton } from '@/components/ui/ping-button';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingModal } from '@/components/ui/ping-modal';
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
import { customReactionId, reactionLabel as buildReactionLabel } from '../reaction-label';

// Picker nặng (toàn bộ dataset emoji) chỉ tải khi người dùng thực sự mở hộp chọn — không đụng
// bundle ban đầu của kênh chat.
const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((module) => module.EmojiPicker),
  { ssr: false },
);

/**
 * Nội dung emoji của một pill reaction (TG.24, ADR-0081): unicode hiển thị thẳng; token `c:<id>`
 * resolve qua cache server → ảnh. Emoji đã xóa (không resolve được) thì hiện chip `:ten:` nếu API
 * trả `emojiName`, không thì biểu tượng chung có nhãn — không bao giờ hiện id.
 */
function ReactionEmoji({
  emoji,
  emojiName,
  map,
  deletedLabel,
}: {
  emoji: string;
  emojiName?: string;
  map: Map<string, CustomEmojiDto>;
  deletedLabel: string;
}) {
  const id = customReactionId(emoji);
  if (!id) return <>{emoji}</>;
  const resolved = map.get(id);
  if (!resolved) {
    if (emojiName) {
      return (
        <span className="text-xs" data-testid="reaction-deleted-emoji">
          :{emojiName}:
        </span>
      );
    }
    return (
      <ImageOff
        aria-label={deletedLabel}
        role="img"
        className="size-4"
        data-testid="reaction-deleted-emoji"
      />
    );
  }
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
  const { ability, ready, serverId } = useServerAbility();
  const toggle = useToggleReaction(channelId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactorEmoji, setReactorEmoji] = useState<string | null>(null);
  const reactions = message.reactions ?? [];
  const canReact = ready && ability.can('create', 'Reaction') && message.status === undefined;
  // TG.24: map id → emoji server để render token `c:<id>` trong pill và nhãn dialog.
  const emojiMap = useEmojiMap(serverId);
  // Nhãn hiển thị/aria: emoji unicode giữ nguyên; token custom → `:ten:` (cache server, rồi tên
  // do API trả cho emoji đã xóa), cuối cùng là nhãn "đã xóa" — không để id lộ ra (ADR-0081).
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

  const errorMessage = useErrorMessage();

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
    <PingModal
      open={emoji !== null}
      onCancel={() => onOpenChange(false)}
      title={t('reactorsTitle', { emoji: emojiLabel })}
      footer={null}
      destroyOnHidden
    >
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
              <PingAvatar size="sm" src={user.avatarUrl ?? undefined} />
              <span className="font-medium">{user.displayName}</span>
              <span className="text-xs text-muted-foreground">@{user.username}</span>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <PingButton
          variant="secondary"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('reactorsLoadMore')}
        </PingButton>
      )}
    </PingModal>
  );
}
