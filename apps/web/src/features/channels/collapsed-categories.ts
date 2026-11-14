const KEY_PREFIX = 'ping.cat-collapsed';

export function collapsedKey(userId: string, serverId: string): string {
  return `${KEY_PREFIX}.${userId}.${serverId}`;
}

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
    // localStorage đầy/bị chặn: bỏ qua.
  }
}

export function toggleCollapsed(ids: string[], categoryId: string): string[] {
  return ids.includes(categoryId) ? ids.filter((id) => id !== categoryId) : [...ids, categoryId];
}
