'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { PingButton } from '@/components/ui/ping-button';
import { PingModal } from '@/components/ui/ping-modal';
import { useErrorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { listReactionUsers } from '../../api';

export function ReactorListDialog({
  messageId,
  emoji,
  emojiLabel,
  onOpenChange,
}: {
  messageId: string;
  emoji: string | null;
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
