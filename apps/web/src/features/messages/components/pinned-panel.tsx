'use client';

import { PinOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingSkeleton } from '@/components/ui/ping-skeleton';
import { pingToast } from '@/components/ui/ping-toast';
import { useServerAbility } from '@/features/permissions/context';
import { errorReference } from '@/lib/error-reference';
import { useErrorMessage } from '@/lib/error-message';
import { usePins, useSetPinned } from '../hooks';

export function PinnedPanel({
  channelId,
  onOpen,
}: {
  channelId: string;
  onOpen: (messageId: string) => void;
}) {
  const t = useTranslations('messages');
  const ta = useTranslations('app');
  const tc = useTranslations('common');
  const format = useFormatter();
  const { ability, ready } = useServerAbility();
  const errorMessage = useErrorMessage();
  const query = usePins(channelId, true);
  const setPinned = useSetPinned(channelId);
  const canUnpin = ability.can('delete', 'Pin');
  const pins = query.data ?? [];
  const reference = query.isError ? errorReference(query.error) : null;

  return (
    <aside
      aria-label={t('pinnedTitle')}
      data-testid="pinned-panel"
      className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-l bg-sidebar p-2 max-lg:absolute max-lg:top-12 max-lg:right-0 max-lg:bottom-0 max-lg:z-20 max-lg:shadow-overlay"
    >
      <h2 className="px-2 py-1 text-sm font-semibold">{t('pinnedTitle')}</h2>
      {query.isPending && (
        <div
          role="status"
          aria-busy="true"
          aria-label={t('loading')}
          className="flex flex-col gap-2 p-2"
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-1">
              <PingSkeleton block className="h-4 w-24" />
              <PingSkeleton block className="h-3 w-full" />
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm text-destructive">
          <p>{errorMessage(query.error)}</p>
          {reference && (
            <p className="text-xs text-muted-foreground">
              <code className="select-all">{ta('errorId', { id: reference })}</code>
            </p>
          )}
          <PingButton
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {tc('retry')}
          </PingButton>
        </div>
      )}
      {!query.isPending && !query.isError && pins.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">{t('pinnedEmpty')}</p>
      )}
      <ul className="flex flex-col">
        {pins.map((pin) => (
          <li
            key={pin.message.id}
            data-testid="pinned-item"
            data-message-id={pin.message.id}
            className="flex items-start gap-1 rounded-md px-1 hover:bg-accent/50"
          >
            <button
              type="button"
              onClick={() => onOpen(pin.message.id)}
              className="flex min-w-0 flex-1 flex-col gap-0.5 py-1.5 pl-1 text-left"
            >
              <span className="truncate text-sm font-medium">{pin.message.author.displayName}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {pin.message.content}
              </span>
              <span className="text-xs text-muted-foreground">
                {pin.pinnedBy && `${t('pinnedBy', { name: pin.pinnedBy.displayName })} · `}
                {format.dateTime(new Date(pin.pinnedAt), {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
            {canUnpin && (
              <PingIconButton
                icon={<PinOff />}
                aria-label={t('unpin')}
                className="mt-1 shrink-0"
                disabled={!ready || setPinned.isPending}
                onClick={() =>
                  setPinned.mutate(
                    { messageId: pin.message.id, pin: false },
                    { onError: (error) => pingToast.error(errorMessage(error)) },
                  )
                }
              />
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
