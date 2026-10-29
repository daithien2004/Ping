'use client';

import type { NotificationPrefDto, NotifyLevel, ServerSummary } from '@ping/shared';
import { NOTIFY_DEFAULT_LEVEL } from '@ping/shared';
import { BellOff, BellRing } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingSegmented } from '@/components/ui/ping-segmented';
import { PingSwitch } from '@/components/ui/ping-switch';
import {
  useNotificationPermission,
  requestNotificationPermission,
} from '@/features/notifications/components/enable-notifications';
import {
  useNotificationPrefs,
  useResetNotificationPref,
  useSetNotificationPref,
} from '@/features/notifications/hooks';
import { findPref } from '@/features/notifications/notification-cache';
import {
  readIgnoreEveryone,
  readSoundEnabled,
  writeIgnoreEveryone,
  writeSoundEnabled,
} from '@/features/notifications/notify-storage';
import { useServers } from '@/features/servers/hooks';
import { useServerChannels } from '../hooks';
import { SettingsSection } from './settings-section';

const LEVELS = ['all', 'mentions', 'none'] as const;

/** Nhãn mức dùng chung với chuông kênh (TG.12) — một nguồn chữ, không dịch lại. */
function LevelControl({
  value,
  onChange,
  testIdPrefix,
  disabled,
}: {
  value: NotifyLevel;
  onChange: (level: NotifyLevel) => void;
  testIdPrefix: string;
  disabled?: boolean;
}) {
  const t = useTranslations('notifications');
  const labels = { all: t('levelAll'), mentions: t('levelMentions'), none: t('levelNone') };
  return (
    <PingSegmented
      aria-label={t('levelLabel')}
      disabled={disabled}
      value={value}
      options={LEVELS.map((level) => ({
        value: level,
        label: <span data-testid={`${testIdPrefix}-${level}`}>{labels[level]}</span>,
      }))}
      onChange={(next) => onChange(next as NotifyLevel)}
    />
  );
}

/** Quyền Notification là trạng thái CỦA TRÌNH DUYỆT (thiết bị này), không lưu server. */
function BrowserPermissionRow() {
  const t = useTranslations('settings.notifications');
  const permission = useNotificationPermission();
  const statusText =
    permission === 'granted'
      ? t('permissionGranted')
      : permission === 'denied'
        ? t('permissionDenied')
        : permission === 'unsupported'
          ? t('permissionUnsupported')
          : t('permissionDefault');
  return (
    <div className="flex items-center justify-between gap-4" data-testid="settings-permission-row">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{t('browserPermission')}</span>
        <p className="text-xs text-muted-foreground" data-testid="settings-permission-status">
          {statusText}
        </p>
      </div>
      {permission === 'default' ? (
        <PingButton
          size="sm"
          variant="secondary"
          data-testid="settings-permission-request"
          onClick={requestNotificationPermission}
        >
          {t('requestPermission')}
        </PingButton>
      ) : null}
    </div>
  );
}

/** Hai toggle cài đặt THIẾT BỊ gom từ chuông kênh/popover TG.12 về trang cài đặt. */
function DeviceOptions() {
  const t = useTranslations('settings.notifications');
  // localStorage chỉ đọc ở client — khởi tạo qua lazy initializer (component này chỉ client).
  const [ignoreEveryone, setIgnoreEveryone] = useState(readIgnoreEveryone);
  const [sound, setSound] = useState(readSoundEnabled);
  return (
    <section aria-label={t('deviceSection')} className="flex flex-col divide-y divide-border">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium" id="settings-ignore-everyone-label">
            {t('ignoreEveryone')}
          </span>
          <p className="text-xs text-muted-foreground">{t('ignoreEveryoneHint')}</p>
        </div>
        <PingSwitch
          size="small"
          checked={ignoreEveryone}
          aria-labelledby="settings-ignore-everyone-label"
          data-testid="settings-ignore-everyone"
          onChange={(value) => {
            setIgnoreEveryone(value);
            writeIgnoreEveryone(value);
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium" id="settings-sound-label">
            {t('sound')}
          </span>
          <p className="text-xs text-muted-foreground">{t('soundHint')}</p>
        </div>
        <PingSwitch
          size="small"
          checked={sound}
          aria-labelledby="settings-sound-label"
          data-testid="settings-sound"
          onChange={(value) => {
            setSound(value);
            writeSoundEnabled(value);
          }}
        />
      </div>
    </section>
  );
}

/** Một dòng mức theo server: chưa có dòng prefs là đang theo mặc định chung (all). */
function ServerLevelRow({ server }: { server: ServerSummary }) {
  const t = useTranslations('settings.notifications');
  const { data } = useNotificationPrefs();
  const row = findPref(data?.prefs ?? [], 'server', server.id);
  const setPref = useSetNotificationPref('server');
  const reset = useResetNotificationPref('server');

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
            setPref.mutate({
              targetId: server.id,
              level,
              mutedUntil: row?.mutedUntil ?? null,
            })
          }
        />
        {row && (
          <PingButton
            size="sm"
            variant="ghost"
            data-testid={`settings-server-reset-${server.id}`}
            disabled={reset.isPending}
            onClick={() => reset.mutate(server.id)}
          >
            {t('reset')}
          </PingButton>
        )}
      </div>
    </div>
  );
}

/** Các dòng ghi đè theo kênh của MỘT server — tên kênh resolve qua cache channels dùng chung. */
function ServerChannelOverrides({
  serverId,
  serverName,
  prefs,
}: {
  serverId: string;
  serverName: string;
  prefs: NotificationPrefDto[];
}) {
  const t = useTranslations('settings.notifications');
  const { data: channels } = useServerChannels(serverId);
  const setPref = useSetNotificationPref('channel');
  const reset = useResetNotificationPref('channel');
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
                setPref.mutate({
                  targetId: channel.id,
                  level,
                  mutedUntil: pref.mutedUntil,
                })
              }
            />
            <PingButton
              size="sm"
              variant="ghost"
              data-testid={`settings-channel-reset-${channel.id}`}
              disabled={reset.isPending}
              onClick={() => reset.mutate(channel.id)}
            >
              {t('reset')}
            </PingButton>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Thông báo (TG.13) — gom về đây những thứ trước đây rải rác (TG.12): cài đặt thiết bị
 * (bỏ qua @everyone, âm thanh — localStorage), quyền Notification của trình duyệt, mức theo
 * server và các ghi đè theo kênh (server API, đồng bộ thiết bị). Server/channel đã rời khỏi
 * thì dòng tương ứng không còn chỗ resolve tên — bỏ lặng lẽ, prefs thừa vô hại.
 */
export function NotificationsSection() {
  const t = useTranslations('settings.notifications');
  const { data: servers } = useServers();
  const { data: prefsData } = useNotificationPrefs();
  const prefs = prefsData?.prefs ?? [];
  const channelPrefs = prefs.filter((pref) => pref.scope === 'channel');

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-notifications">
      <div className="flex max-w-2xl flex-col gap-6">
        <BrowserPermissionRow />

        <DeviceOptions />

        <section aria-label={t('serverLevels')} className="flex flex-col">
          <h2 className="text-sm font-semibold">{t('serverLevels')}</h2>
          <p className="pb-1 text-xs text-muted-foreground">{t('serverLevelsHint')}</p>
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
