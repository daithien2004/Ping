import type { DmSummary } from '@ping/shared';

/**
 * Logic biến đổi cache danh sách DM (TG.9, ADR-0070) — hàm thuần có test riêng (quy tắc FE:
 * server state chỉ ghi cache trong hooks.ts, biến đổi nằm ở đây).
 *
 * Giống bộ đếm unread của server (features/unread): con số realtime là ước lượng tối thiểu,
 * đối soát lại bằng GET /dms khi socket reconnect (badge DM đi room `user:<id>` best-effort).
 */

const cap = (value: number) => Math.min(value, 100);

/**
 * Một tin DM vừa đến (event `channel.activity` với `serverId === null`): tăng unread và đẩy
 * `lastMessageAt` lên "bây giờ" để hội thoại nổi lên đầu danh sách. Mọi tin DM đều là
 * mention-style (mục 7 của ADR) nên chỉ một bộ đếm duy nhất. Hội thoại chưa có trong cache
 * (đối tác tạo DM mới giữa chừng) → đợi lần fetch sau, không đoán.
 */
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

/**
 * `read.updated` của chính mình (mark-read tái dùng PUT /channels/:id/read, phát tới mọi tab):
 * unread của DM đó về 0 và cursor khớp để lần mở sau không hiện lại vạch tin mới oan.
 */
export function applyDmRead(
  dms: DmSummary[],
  channelId: string,
  lastReadMessageId: string,
): DmSummary[] {
  return dms.map((dm) =>
    dm.channelId === channelId ? { ...dm, unreadCount: 0, lastReadMessageId } : dm,
  );
}

/**
 * Thứ tự hiển thị: `lastMessageAt` mới nhất trước (mục 2 của task). Hội thoại chưa từng có
 * tin (`lastMessageAt` null) nằm sau, giữ thứ tự ổn định theo channelId.
 */
export function sortedDms(dms: DmSummary[]): DmSummary[] {
  return [...dms].sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return a.channelId.localeCompare(b.channelId);
  });
}

/** Tổng unread để badge đỏ trên mục DM của rail (mọi tin DM đều mention-style). */
export function dmUnreadTotal(dms: DmSummary[]): number {
  return dms.reduce((sum, dm) => sum + dm.unreadCount, 0);
}
