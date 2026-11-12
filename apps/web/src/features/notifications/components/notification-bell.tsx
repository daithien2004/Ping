'use client';

import type { NotifyLevel } from '@ping/shared';
import { NOTIFY_DEFAULT_LEVEL } from '@ping/shared';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingPopover } from '@/components/ui/ping-popover';
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

/** Ba mức kèm một dòng giải thích: đọc hiểu ngay, không phải suy từ nhãn ngắn. */
const LEVELS = [
  { value: 'all', key: 'levelAll', hintKey: 'levelAllHint' },
  { value: 'mentions', key: 'levelMentions', hintKey: 'levelMentionsHint' },
  { value: 'none', key: 'levelNone', hintKey: 'levelNoneHint' },
] as const satisfies ReadonlyArray<{ value: NotifyLevel; key: string; hintKey: string }>;

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
  // Danh sách thời lượng mute mở theo nhu cầu: 5 nút luôn hiện chiếm gần nửa popover.
  const [muteOpen, setMuteOpen] = useState(false);

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
          data-slot="notify-popover"
          role="group"
          aria-label={t('title')}
          className="flex w-72 flex-col"
        >
          <p className="px-2 pb-1 text-sm font-semibold">{t('title')}</p>
          {isError ? (
            <div role="alert" className="flex items-center gap-2 px-2 text-xs text-destructive">
              {t('prefsLoadFailed')}
              <PingButton variant="secondary" size="sm" onClick={() => void refetch()}>
                {tc('retry')}
              </PingButton>
            </div>
          ) : null}
          <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
            <legend className="sr-only">{t('levelLabel')}</legend>
            {LEVELS.map((option) => (
              <label
                key={option.value}
                htmlFor={`notify-level-${option.value}`}
                aria-label={t(option.key)}
                data-testid={`notify-level-${option.value}`}
                className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50"
              >
                <input
                  id={`notify-level-${option.value}`}
                  type="radio"
                  name="notify-level"
                  value={option.value}
                  checked={level === option.value}
                  disabled={setPref.isPending}
                  onChange={() => changeLevel(option.value)}
                  className="focus-ring mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-strong transition-[border-width,border-color] checked:border-[5px] checked:border-primary"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{t(option.key)}</span>
                  <span className="text-xs text-muted-foreground">{t(option.hintKey)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {!row && (
            <p
              className="px-2 pt-1 text-xs text-muted-foreground"
              data-testid="notify-default-hint"
            >
              {serverRow ? t('serverDefaultHint') : t('globalDefaultHint')}
            </p>
          )}
          <div className="mt-2 border-t px-2 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{t('muteLabel')}</span>
                {remaining > 0 && (
                  <span className="text-xs text-muted-foreground" data-testid="notify-muted-status">
                    {t('mutedUntil', { count: remaining })}
                  </span>
                )}
              </span>
              {remaining > 0 ? (
                <PingButton
                  variant="ghost"
                  size="sm"
                  data-testid="notify-unmute"
                  disabled={setPref.isPending}
                  onClick={unmute}
                >
                  {t('unmute')}
                </PingButton>
              ) : (
                <PingButton
                  variant="secondary"
                  size="sm"
                  data-testid="notify-mute-toggle"
                  aria-expanded={muteOpen}
                  disabled={setPref.isPending}
                  onClick={() => setMuteOpen((open) => !open)}
                >
                  {t('muteAction')}
                </PingButton>
              )}
            </div>
            {muteOpen && remaining === 0 && (
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t('muteLabel')}>
                {MUTE_OPTIONS.map((option) => (
                  <PingButton
                    key={option.key}
                    variant="secondary"
                    size="sm"
                    data-testid={option.testId}
                    disabled={setPref.isPending}
                    onClick={() => {
                      setMuteOpen(false);
                      muteFor(option.minutes);
                    }}
                  >
                    {t(option.key)}
                  </PingButton>
                ))}
              </div>
            )}
          </div>
          {/* Tùy chọn toàn cục người dùng: áp dụng cho mọi kênh, lưu thiết bị này (localStorage). */}
          <div className="mt-2 flex items-start justify-between gap-2 border-t px-2 pt-2">
            <span className="flex min-w-0 flex-col">
              <span id="notify-ignore-everyone-label" className="text-sm font-medium">
                {t('ignoreEveryone')}
              </span>
              <span className="text-xs text-muted-foreground">{t('ignoreEveryoneScope')}</span>
            </span>
            <PingSwitch
              size="sm"
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
