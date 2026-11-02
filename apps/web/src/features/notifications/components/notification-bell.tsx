'use client';

import type { NotifyLevel } from '@ping/shared';
import { NOTIFY_DEFAULT_LEVEL } from '@ping/shared';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingPopover } from '@/components/ui/ping-popover';
import { PingSegmented } from '@/components/ui/ping-segmented';
import { PingSwitch } from '@/components/ui/ping-switch';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useNotificationPrefs, useSetNotificationPref } from '../hooks';
import { findPref, remainingMuteMinutes } from '../notification-cache';
import { readIgnoreEveryone, writeIgnoreEveryone } from '../notify-storage';

/** mutedUntil = bây giờ + thời lượng (gọi trong event handler, không trong render). */
const muteUntilFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/** Nhóm thời lượng mute: mutedUntil = now + duration, gửi kèm mức hiện hành (TG.12). */
const MUTE_OPTIONS = [
  { minutes: 15, key: 'mute15m', testId: 'notify-mute-15m' },
  { minutes: 60, key: 'mute1h', testId: 'notify-mute-1h' },
  { minutes: 180, key: 'mute3h', testId: 'notify-mute-3h' },
  { minutes: 480, key: 'mute8h', testId: 'notify-mute-8h' },
  { minutes: 1440, key: 'mute24h', testId: 'notify-mute-24h' },
] as const;

/**
 * Chuông cài đặt thông báo của MỘT channel (TG.12), đặt ở header channel/DM: mức
 * (all/mentions/none) + mute có hạn + tùy chọn toàn cục "Bỏ qua @everyone" (localStorage —
 * cài đặt thiết bị; trang cài đặt đầy đủ thuộc TG.13). Chưa có dòng channel thì hiển thị mức
 * hiệu dụng (dòng server nếu có, rồi mặc định chung) kèm nhãn giải thích.
 */
export function NotificationBell({
  serverId,
  channelId,
  dm = false,
}: {
  /** Server của channel; `null` = DM (không có dòng server để kế thừa). */
  serverId: string | null;
  channelId: string;
  dm?: boolean;
}) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const { data, isError, refetch } = useNotificationPrefs();
  const prefs = data?.prefs ?? [];
  const setPref = useSetNotificationPref('channel');
  const [open, setOpen] = useState(false);
  // Popover chỉ dựng nội dung sau lần mở đầu tiên nên đọc localStorage lúc này là an toàn (client).
  const [ignoreEveryone, setIgnoreEveryone] = useState(() => readIgnoreEveryone());
  const onError = (error: unknown) => pingToast.error(errorMessage(error));

  const row = findPref(prefs, 'channel', channelId);
  const serverRow = serverId === null ? undefined : findPref(prefs, 'server', serverId);
  const level = row?.level ?? serverRow?.level ?? NOTIFY_DEFAULT_LEVEL;
  const mutedUntil = row?.mutedUntil ?? serverRow?.mutedUntil ?? null;
  // "Bây giờ" chỉ chốt khi MỞ popover (event handler, không phải render) — render phải thuần;
  // dòng "còn X phút" đứng yên trong phiên mở là đủ, mở lại sẽ cập nhật.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const remaining = openedAt === null ? 0 : remainingMuteMinutes(mutedUntil, openedAt);

  /** Đổi mức: giữ mute của CHÍNH kênh (nếu có), không kế thừa mute server vào dòng override. */
  function changeLevel(next: NotifyLevel) {
    setPref.mutate(
      { targetId: channelId, level: next, mutedUntil: row?.mutedUntil ?? null },
      { onError },
    );
  }
  /** Mute: gửi kèm mức hiện hành để dòng prefs luôn tự đủ, không phụ thuộc thay đổi song song. */
  function muteFor(minutes: number) {
    setPref.mutate(
      { targetId: channelId, level, mutedUntil: muteUntilFromNow(minutes) },
      { onError },
    );
  }
  function unmute() {
    setPref.mutate({ targetId: channelId, level, mutedUntil: null }, { onError });
  }

  return (
    <PingPopover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOpenedAt(Date.now());
      }}
      content={
        <div
          data-testid="notify-popover"
          role="group"
          aria-label={t('title')}
          className="flex w-64 flex-col gap-2"
        >
          <p className="text-sm font-semibold">{t('title')}</p>
          {isError ? (
            <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
              {t('prefsLoadFailed')}
              <PingButton variant="secondary" size="sm" onClick={() => void refetch()}>
                {tc('retry')}
              </PingButton>
            </div>
          ) : null}
          <PingSegmented
            aria-label={t('levelLabel')}
            value={level}
            options={[
              { value: 'all', label: <span data-testid="notify-level-all">{t('levelAll')}</span> },
              {
                value: 'mentions',
                label: <span data-testid="notify-level-mentions">{t('levelMentions')}</span>,
              },
              {
                value: 'none',
                label: <span data-testid="notify-level-none">{t('levelNone')}</span>,
              },
            ]}
            onChange={(value) => changeLevel(value as NotifyLevel)}
          />
          {!row && (
            <p className="text-xs text-muted-foreground" data-testid="notify-default-hint">
              {serverRow ? t('serverDefaultHint') : t('globalDefaultHint')}
            </p>
          )}
          {remaining > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="notify-muted-status">
              {t('mutedUntil', { count: remaining })}
            </p>
          )}
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('muteLabel')}>
            {MUTE_OPTIONS.map((option) => (
              <PingButton
                key={option.key}
                variant="secondary"
                size="sm"
                data-testid={option.testId}
                disabled={setPref.isPending}
                onClick={() => muteFor(option.minutes)}
              >
                {t(option.key)}
              </PingButton>
            ))}
            <PingButton
              variant="ghost"
              size="sm"
              data-testid="notify-unmute"
              disabled={setPref.isPending}
              onClick={unmute}
            >
              {t('unmute')}
            </PingButton>
          </div>
          {/* Tùy chọn toàn cục người dùng: áp dụng cho mọi kênh, lưu thiết bị này (localStorage). */}
          <div className="flex items-center justify-between gap-2 border-t pt-2">
            <span id="notify-ignore-everyone-label" className="text-xs">
              {t('ignoreEveryone')}
            </span>
            <PingSwitch
              size="small"
              checked={ignoreEveryone}
              aria-labelledby="notify-ignore-everyone-label"
              data-testid="notify-ignore-everyone"
              onChange={(value) => {
                setIgnoreEveryone(value);
                writeIgnoreEveryone(value);
              }}
            />
          </div>
        </div>
      }
    >
      <PingIconButton
        icon={<Bell />}
        aria-label={t(dm ? 'bellDm' : 'bellChannel')}
        aria-expanded={open}
        data-testid={dm ? 'notify-bell-dm' : 'notify-bell'}
      />
    </PingPopover>
  );
}
