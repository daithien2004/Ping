import type { ChannelUnreadDto } from '@ping/shared';

/**
 * Logic biến đổi cache unread (T4.3) — hàm thuần, có test riêng (quy tắc FE: server state
 * chỉ ghi cache trong hooks.ts, biến đổi nằm ở đây).
 *
 * Bộ đếm phía client là **ước lượng tối thiểu** cho badge realtime: chỉ tăng theo event,
 * đối soát lại bằng GET unread khi socket reconnect. Chênh lệch tự sửa ở lần fetch sau.
 */

export interface UnreadTotals {
  unreadTotal: number;
  mentionTotal: number;
}

const cap = (value: number) => Math.min(value, 100);

/**
 * Một tin mới vừa đến channel: tăng unread (không tính tin của chính mình) và mentionCount
 * nếu mình được nhắc. Channel đang xem do nơi gọi lọc trước (đã được đánh dấu đã đọc).
 */
export function applyIncoming(
  unread: ChannelUnreadDto[],
  channelId: string,
  { isOwn, mention }: { isOwn: boolean; mention: boolean },
): ChannelUnreadDto[] {
  const index = unread.findIndex((row) => row.channelId === channelId);
  if (index < 0) {
    // Channel chưa có trong danh sách (mới tạo giữa chừng): đợi lần fetch sau, không đoán.
    return unread;
  }
  const row = unread[index]!;
  const next: ChannelUnreadDto = {
    ...row,
    unreadCount: isOwn ? row.unreadCount : cap(row.unreadCount + 1),
    mentionCount: mention ? cap(row.mentionCount + 1) : row.mentionCount,
  };
  return [...unread.slice(0, index), next, ...unread.slice(index + 1)];
}

/**
 * `read.updated` từ CHÍNH mình (tab khác vừa đọc): cursor mới đã ổn định ở server, bộ đếm
 * của channel đó về 0 và cursor cục bộ khớp để vạch "tin mới" không nhảy.
 */
export function applyRead(
  unread: ChannelUnreadDto[],
  channelId: string,
  lastReadMessageId: string,
): ChannelUnreadDto[] {
  return unread.map((row) =>
    row.channelId === channelId
      ? { ...row, unreadCount: 0, mentionCount: 0, lastReadMessageId }
      : row,
  );
}

/** Tổng để hiển thị badge server và số trên tab title (mention). */
export function totals(unread: ChannelUnreadDto[]): UnreadTotals {
  return unread.reduce<UnreadTotals>(
    (acc, row) => ({
      unreadTotal: acc.unreadTotal + row.unreadCount,
      mentionTotal: acc.mentionTotal + row.mentionCount,
    }),
    { unreadTotal: 0, mentionTotal: 0 },
  );
}

/**
 * Vạch "tin mới": id của tin chưa đọc ĐẦU TIÊN trong danh sách đã tải, hoặc null nếu
 * chưa đọc lần nào (không vạch) / đã đọc hết. So sánh chuỗi UUIDv7 tăng dần theo thời gian.
 */
export function firstUnreadId(
  unread: ChannelUnreadDto[] | undefined,
  channelId: string,
  messageIds: string[],
): string | null {
  const cursor = unread?.find((row) => row.channelId === channelId)?.lastReadMessageId;
  if (!cursor) return null;
  return messageIds.find((id) => id > cursor) ?? null;
}
