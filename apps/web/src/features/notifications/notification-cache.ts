import type {
  ChannelUnreadDto,
  DmListResponse,
  NotificationPrefDto,
  NotificationPrefsResponse,
  NotifyLevel,
} from '@ping/shared';
import { NOTIFY_DEFAULT_LEVEL } from '@ping/shared';

/**
 * Logic chọn prefs hiệu dụng của TG.12 — hàm thuần, có test riêng (quy tắc FE: biến đổi
 * cache nằm ở *-cache.ts, hook chỉ ghi cache). Quyết định BẮN thông báo là `shouldNotify`
 * của packages/shared — hàm này chỉ chuẩn bị dữ liệu vào cho nó.
 *
 * Ngữ nghĩa "override": dòng channel thay THỂ TRỌN VẸN dòng server (level + mutedUntil cùng
 * lúc) — đặt riêng một kênh không bị mute của server ám lại, đúng comment của
 * NotificationPrefDto trong shared ("override server").
 */

/** Dòng prefs của một target, hoặc undefined khi chưa cấu hình. */
export function findPref(
  prefs: NotificationPrefDto[],
  scope: 'server' | 'channel',
  targetId: string,
): NotificationPrefDto | undefined {
  return prefs.find((row) => row.scope === scope && row.targetId === targetId);
}

/**
 * Mức hiệu dụng của một channel: dòng channel → dòng server (null với DM) → mặc định chung.
 * DM không thuộc server nào nên bỏ qua bước dòng server.
 */
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

/** Mute hiệu dụng cùng nguồn với `effectiveLevel`: channel override server, mốc quá khứ coi như không mute. */
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

/**
 * Cờ mention cho `shouldNotify` (TG.12): event `mention.created` (chỉ tới người được nhắc,
 * đã kiểm quyền phía server) là nguồn sự thật của "mình bị nhắc"; @everyone nhận biết từ
 * nội dung. `ignoreEveryone` chỉ được che luôn cả cờ mention NẾU tin đó ping vì @everyone —
 * nhắc thẳng tên mình thì vẫn tính là mention.
 */
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

/**
 * @everyone/@here trong nội dung tin — cùng ranh giới từ với mention-parser của API
 * (`@` sau ranh giới từ, token trọn vẹn) để không dính email `a@b` hay `@@everyone`.
 * `@here` không phải ping thật của API hiện tại nhưng gồm theo plan TG.12 ("@everyone/@here").
 */
const EVERYONE_TOKEN = /(?<![A-Za-z0-9_@])@(?:everyone|here)(?![A-Za-z0-9_.-])/;

export function hasEveryoneToken(content: string): boolean {
  return EVERYONE_TOKEN.test(content);
}

/** Upsert một dòng prefs vào cache sau PUT — giữ mảng ổn định cho TanStack so sánh. */
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

/** Gỡ một dòng prefs khỏi cache sau DELETE reset (idempotent: không có vẫn trả nguyên). */
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

/**
 * Tổng badge cho tiêu đề/favicon (TG.12): tổng unread mọi server + unread DM — thay ngữ nghĩa
 * cũ "chỉ tổng mention" (T4.3) vì mức thông báo 'all' giờ cũng đáng chú ý như mention.
 */
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
