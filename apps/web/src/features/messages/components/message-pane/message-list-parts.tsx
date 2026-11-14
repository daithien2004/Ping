'use client';

import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { useServerAbility } from '@/features/permissions/context';

export const HEADER_HEIGHT = 48;

export function RoomDenied() {
  const errors = useTranslations('errors');
  return (
    <p role="alert" className="m-auto text-sm text-muted-foreground">
      {errors('FORBIDDEN')}
    </p>
  );
}

export function FocusBanner({ missing, pending }: { missing: boolean; pending: boolean }) {
  const t = useTranslations('messages');
  if (missing) {
    return (
      <p
        role="alert"
        data-testid="focus-missing"
        className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
      >
        {t('focusMissing')}
      </p>
    );
  }
  if (!pending) return null;
  return (
    <p
      role="status"
      data-testid="focus-loading"
      className="border-b px-4 py-2 text-sm text-muted-foreground"
    >
      {t('focusLoading')}
    </p>
  );
}

export function ListHeader({
  loadingOlder,
  hasOlder,
  isDm,
  channelName,
}: {
  loadingOlder: boolean;
  hasOlder: boolean;
  isDm: boolean;
  channelName: string;
}) {
  const t = useTranslations('messages');
  return (
    <p
      className="absolute inset-x-0 top-0 flex items-end px-4 pb-2 text-sm text-muted-foreground"
      style={{ height: HEADER_HEIGHT }}
    >
      {loadingOlder
        ? t('loadingOlder')
        : hasOlder
          ? ''
          : isDm
            ? t('dmStart', { name: channelName })
            : t('channelStart', { channel: channelName })}
    </p>
  );
}

export function EmptyState({ onCompose }: { onCompose: () => void }) {
  const t = useTranslations('messages');
  const { ability } = useServerAbility();
  return (
    <div
      className="absolute inset-x-0 flex flex-col items-center gap-3 px-4 pt-10 text-center"
      style={{ top: HEADER_HEIGHT }}
    >
      <MessageSquare
        aria-hidden
        className="size-8 text-muted-foreground"
        data-testid="empty-icon"
      />
      <p className="text-sm text-muted-foreground">{t('empty')}</p>
      {ability.can('create', 'Message') && (
        <PingButton size="sm" variant="secondary" onClick={onCompose}>
          {t('emptyAction')}
        </PingButton>
      )}
    </div>
  );
}

export function NewDivider() {
  const t = useTranslations('messages');
  return (
    <p
      aria-label={t('newDivider')}
      className="mx-4 mb-1 flex items-center gap-2 text-xs font-medium text-destructive"
    >
      <span className="h-px flex-1 bg-destructive/40" aria-hidden />
      {t('newDivider')}
      <span className="h-px flex-1 bg-destructive/40" aria-hidden />
    </p>
  );
}

export function LoadNewerBar({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  const t = useTranslations('messages');
  return (
    <div className="flex justify-center border-t px-4 py-2">
      <PingButton
        size="sm"
        variant="secondary"
        data-testid="load-newer"
        onClick={onLoad}
        disabled={loading}
      >
        {loading ? t('loadingNewer') : t('loadNewer')}
      </PingButton>
    </div>
  );
}
