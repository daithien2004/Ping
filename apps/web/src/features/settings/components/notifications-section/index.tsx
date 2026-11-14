'use client';

import { BellRing } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { useNotificationPrefs } from '@/features/notifications/hooks';
import { useServers } from '@/features/servers/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { SettingsSection } from '../settings-section';
import { BrowserPermissionRow } from './browser-permission-row';
import { DeviceOptions } from './device-options';
import { ServerChannelOverrides } from './server-channel-overrides';
import { ServerLevelRow } from './server-level-row';

export function NotificationsSection() {
  const t = useTranslations('settings.notifications');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const { data: servers } = useServers();
  const prefsQuery = useNotificationPrefs();
  const prefs = prefsQuery.data?.prefs ?? [];
  const channelPrefs = prefs.filter((pref) => pref.scope === 'channel');

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-notifications">
      <div className="flex max-w-2xl flex-col gap-6">
        <BrowserPermissionRow />

        <DeviceOptions />

        <section aria-label={t('serverLevels')} className="flex flex-col">
          <h2 className="text-sm font-semibold">{t('serverLevels')}</h2>
          <p className="pb-1 text-xs text-muted-foreground">{t('serverLevelsHint')}</p>
          {prefsQuery.isError && (
            <div role="alert" className="flex flex-col items-start gap-2 py-2 text-sm">
              <p className="text-destructive">{errorMessage(prefsQuery.error)}</p>
              <PingButton
                size="sm"
                variant="secondary"
                disabled={prefsQuery.isFetching}
                onClick={() => void prefsQuery.refetch()}
              >
                {tc('retry')}
              </PingButton>
            </div>
          )}
          {(servers ?? []).length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">{t('serversEmpty')}</p>
          )}
          {(servers ?? []).map((server) => (
            <div key={server.id} className="border-t border-border first:border-t-0">
              <ServerLevelRow server={server} />
            </div>
          ))}
        </section>

        <section aria-label={t('channelOverrides')} className="flex flex-col">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <BellRing className="size-4" aria-hidden />
            {t('channelOverrides')}
          </h2>
          <p className="pb-1 text-xs text-muted-foreground">{t('channelOverridesHint')}</p>
          {channelPrefs.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground" data-testid="settings-channel-empty">
              {t('channelOverridesEmpty')}
            </p>
          ) : (
            (servers ?? []).map((server) => (
              <ServerChannelOverrides
                key={server.id}
                serverId={server.id}
                serverName={server.name}
                prefs={channelPrefs}
              />
            ))
          )}
        </section>
      </div>
    </SettingsSection>
  );
}
