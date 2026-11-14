import type { ServerSummary } from '@ping/shared';
import { NOTIFY_DEFAULT_LEVEL } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { pingToast } from '@/components/ui/ping-toast';
import {
  useNotificationPrefs,
  useResetNotificationPref,
  useSetNotificationPref,
} from '@/features/notifications/hooks';
import { findPref } from '@/features/notifications/notification-cache';
import { useErrorMessage } from '@/lib/error-message';
import { LevelControl } from './level-control';

/** Một dòng mức theo server: chưa có dòng prefs là đang theo mặc định chung (all). */
export function ServerLevelRow({ server }: { server: ServerSummary }) {
  const t = useTranslations('settings.notifications');
  const errorMessage = useErrorMessage();
  const { data } = useNotificationPrefs();
  const row = findPref(data?.prefs ?? [], 'server', server.id);
  const setPref = useSetNotificationPref('server');
  const reset = useResetNotificationPref('server');
  const onError = (error: unknown) => pingToast.error(errorMessage(error));

  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      data-testid={`settings-server-row-${server.id}`}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{server.name}</span>
        {!row && <p className="text-xs text-muted-foreground">{t('serverDefaultHint')}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LevelControl
          value={row?.level ?? NOTIFY_DEFAULT_LEVEL}
          testIdPrefix={`settings-server-level-${server.id}`}
          disabled={setPref.isPending}
          onChange={(level) =>
            setPref.mutate(
              {
                targetId: server.id,
                level,
                mutedUntil: row?.mutedUntil ?? null,
              },
              { onError },
            )
          }
        />
        {row && (
          <PingButton
            size="sm"
            variant="ghost"
            data-testid={`settings-server-reset-${server.id}`}
            disabled={reset.isPending}
            onClick={() => reset.mutate(server.id, { onError })}
          >
            {t('reset')}
          </PingButton>
        )}
      </div>
    </div>
  );
}
