import type { DmSummary } from '@ping/shared';

/**
 * Logic biến đổi cache danh sách DM (TG.9, ADR-0070) — hàm thuần có test riêng (quy tắc FE:
 * server state chỉ ghi cache trong hooks.ts, biến đổi nằm ở đây).
 *
 * Giống bộ đếm unread của server (features/unread): con số realtime là ước lượng tối thiểu,
 * đối soát lại bằng GET /dms khi socket reconnect (badge DM đi room `user:<id>` best-effort).
 */

const cap = (value: number) => Math.min(value, 100);

export function applyDmActivity(dms: DmSummary[], channelId: string): DmSummary[] {
  const index = dms.findIndex((dm) => dm.channelId === channelId);
  if (index < 0) return dms;
  const row = dms[index]!;
  const next: DmSummary = {
    ...row,
    unreadCount: cap(row.unreadCount + 1),
    lastMessageAt: new Date().toISOString(),
  };
  return [...dms.slice(0, index), next, ...dms.slice(index + 1)];
}

export function applyDmRead(
  dms: DmSummary[],
  channelId: string,
  lastReadMessageId: string,
): DmSummary[] {
  return dms.map((dm) =>
    dm.channelId === channelId ? { ...dm, unreadCount: 0, lastReadMessageId } : dm,
  );
}

export function sortedDms(dms: DmSummary[]): DmSummary[] {
  return [...dms].sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return a.channelId.localeCompare(b.channelId);
  });
}

export function dmUnreadTotal(dms: DmSummary[]): number {
  return dms.reduce((sum, dm) => sum + dm.unreadCount, 0);
}
