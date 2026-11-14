import type { NotificationPrefDto } from '@ping/shared';
import { BellOff } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { pingToast } from '@/components/ui/ping-toast';
import { useResetNotificationPref, useSetNotificationPref } from '@/features/notifications/hooks';
import { findPref } from '@/features/notifications/notification-cache';
import { useErrorMessage } from '@/lib/error-message';
import { useServerChannels } from '../../hooks';
import { LevelControl } from './level-control';

/** Các dòng ghi đè theo kênh của MỘT server — tên kênh resolve qua cache channels dùng chung. */
export function ServerChannelOverrides({
  serverId,
  serverName,
  prefs,
}: {
  serverId: string;
  serverName: string;
  prefs: NotificationPrefDto[];
}) {
  const t = useTranslations('settings.notifications');
  const errorMessage = useErrorMessage();
  const { data: channels } = useServerChannels(serverId);
  const setPref = useSetNotificationPref('channel');
  const reset = useResetNotificationPref('channel');
  const onError = (error: unknown) => pingToast.error(errorMessage(error));
  const rows = (channels ?? []).flatMap((channel) => {
    const pref = findPref(prefs, 'channel', channel.id);
    return pref ? [{ channel, pref }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <div className="border-t border-dashed border-border/60 pt-1">
      <p className="pt-1 text-xs font-medium text-muted-foreground">{serverName}</p>
      {rows.map(({ channel, pref }) => (
        <div
          key={channel.id}
          className="flex items-center justify-between gap-4 py-3"
          data-testid={`settings-channel-row-${channel.id}`}
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium"># {channel.name}</span>
            {pref.mutedUntil && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <BellOff className="size-3" aria-hidden /> {t('mutedRow')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LevelControl
              value={pref.level}
              testIdPrefix={`settings-channel-level-${channel.id}`}
              disabled={setPref.isPending}
              onChange={(level) =>
                setPref.mutate(
                  {
                    targetId: channel.id,
                    level,
                    mutedUntil: pref.mutedUntil,
                  },
                  { onError },
                )
              }
            />
            <PingButton
              size="sm"
              variant="ghost"
              data-testid={`settings-channel-reset-${channel.id}`}
              disabled={reset.isPending}
              onClick={() => reset.mutate(channel.id, { onError })}
            >
              {t('reset')}
            </PingButton>
          </div>
        </div>
      ))}
    </div>
  );
}
