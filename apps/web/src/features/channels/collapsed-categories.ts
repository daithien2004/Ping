/**
 * TG.10: trạng thái thu gọn category LƯU CỘC BỘ (localStorage) theo user + server — cùng
 * nhóm với "recent sticker"/cài đặt thiết bị (TG.12): thuộc UI client, không đồng bộ qua
 * server. Key tách theo user+server để hai tài khoản trên cùng máy không đè trạng thái nhau.
 */
const KEY_PREFIX = 'ping.cat-collapsed';

export function collapsedKey(userId: string, serverId: string): string {
  return `${KEY_PREFIX}.${userId}.${serverId}`;
}

/** Đọc danh sách category đang thu gọn; dữ liệu hỏng/bị chặn → rỗng, không nổi lỗi. */
export function readCollapsedCategories(userId: string, serverId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(collapsedKey(userId, serverId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeCollapsedCategories(userId: string, serverId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(collapsedKey(userId, serverId), JSON.stringify(ids));
  } catch {
    // localStorage đầy/bị chặn: trạng thái thu gọn chỉ sống trong phiên, không quan trọng.
  }
}

/** Bật/tắt thu gọn một category (hàm thuần để test). */
export function toggleCollapsed(ids: string[], categoryId: string): string[] {
  return ids.includes(categoryId) ? ids.filter((id) => id !== categoryId) : [...ids, categoryId];
}
