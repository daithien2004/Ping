import type {
  ChannelUnreadDto,
  DmListResponse,
  NotificationPrefDto,
  NotificationPrefsResponse,
  NotifyLevel,
} from '@ping/shared';
import { NOTIFY_DEFAULT_LEVEL } from '@ping/shared';

/** Dòng channel thay THẾ TRỌN VẸN dòng server (level + mutedUntil cùng lúc). */

export function findPref(
  prefs: NotificationPrefDto[],
  scope: 'server' | 'channel',
  targetId: string,
): NotificationPrefDto | undefined {
  return prefs.find((row) => row.scope === scope && row.targetId === targetId);
}

export function effectiveLevel(
  prefs: NotificationPrefDto[],
  serverId: string | null,
  channelId: string,
): NotifyLevel {
  return (
    findPref(prefs, 'channel', channelId)?.level ??
    (serverId === null ? undefined : findPref(prefs, 'server', serverId)?.level) ??
    NOTIFY_DEFAULT_LEVEL
  );
}

export function effectiveMutedUntil(
  prefs: NotificationPrefDto[],
  serverId: string | null,
  channelId: string,
): string | null {
  const row =
    findPref(prefs, 'channel', channelId) ??
    (serverId === null ? undefined : findPref(prefs, 'server', serverId));
  return row?.mutedUntil ?? null;
}

/** Số phút mute còn lại (làm tròn lên); 0 khi không mute hoặc đã hết hạn — để popover hiển thị. */
export function remainingMuteMinutes(mutedUntil: string | null, now: number): number {
  if (!mutedUntil) return 0;
  const remaining = Date.parse(mutedUntil) - now;
  return remaining <= 0 ? 0 : Math.ceil(remaining / 60_000);
}

/** `ignoreEveryone` chỉ che cờ mention NẾU tin ping vì @everyone; nhắc thẳng tên mình vẫn là mention. */
export function mentionFlags(
  gotMentionEvent: boolean,
  contentHasEveryone: boolean,
  ignoreEveryone: boolean,
): { isMention: boolean; isEveryone: boolean } {
  const everyonePing = gotMentionEvent && contentHasEveryone;
  return {
    isMention: gotMentionEvent && !(ignoreEveryone && everyonePing),
    isEveryone: everyonePing,
  };
}

/** Cùng ranh giới từ với mention-parser của API: không dính email `a@b` hay `@@everyone`. */
const EVERYONE_TOKEN = /(?<![A-Za-z0-9_@])@(?:everyone|here)(?![A-Za-z0-9_.-])/;

export function hasEveryoneToken(content: string): boolean {
  return EVERYONE_TOKEN.test(content);
}

export function upsertPref(
  response: NotificationPrefsResponse | undefined,
  row: NotificationPrefDto,
): NotificationPrefsResponse {
  const prefs = response?.prefs ?? [];
  const index = prefs.findIndex(
    (item) => item.scope === row.scope && item.targetId === row.targetId,
  );
  if (index < 0) return { prefs: [...prefs, row] };
  const next = [...prefs];
  next[index] = row;
  return { prefs: next };
}

export function removePref(
  response: NotificationPrefsResponse | undefined,
  scope: 'server' | 'channel',
  targetId: string,
): NotificationPrefsResponse {
  if (!response) return { prefs: [] };
  return {
    prefs: response.prefs.filter((item) => !(item.scope === scope && item.targetId === targetId)),
  };
}

export function badgeTotal(
  serverUnread: ChannelUnreadDto[][],
  dms: DmListResponse | undefined,
): number {
  const serverTotal = serverUnread.reduce(
    (sum, rows) => sum + rows.reduce((acc, row) => acc + row.unreadCount, 0),
    0,
  );
  const dmTotal = dms?.dms.reduce((sum, dm) => sum + dm.unreadCount, 0) ?? 0;
  return serverTotal + dmTotal;
}
