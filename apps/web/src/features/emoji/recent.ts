/** Số emoji tối đa lưu trong "Gần đây" (localStorage). */
const RECENT_EMOJI_MAX = 24;
const RECENT_KEY = 'ping.emoji-recent';
const EMPTY: string[] = [];

export function loadRecentEmoji(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveRecentEmoji(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_EMOJI_MAX)));
  } catch {
    // localStorage đầy/bị chặn: bỏ qua — tính năng gần đây là tiện ích, không phải dữ liệu.
  }
}

// Store ngoài React: component đọc qua `useSyncExternalStore` nên không cần effect setState và
// snapshot server (rỗng) khớp với lần render đầu ở client, tránh lệch hydration.
let snapshot: string[] | null = null;
const listeners = new Set<() => void>();

export function recentEmojiSnapshot(): string[] {
  snapshot ??= loadRecentEmoji();
  return snapshot;
}

export function serverRecentEmojiSnapshot(): string[] {
  return EMPTY;
}

export function subscribeRecentEmoji(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ghi emoji vừa dùng lên đầu "Gần đây"; trả danh sách mới để caller giữ state. */
export function rememberEmoji(unicode: string): string[] {
  const next = [unicode, ...recentEmojiSnapshot().filter((item) => item !== unicode)].slice(
    0,
    RECENT_EMOJI_MAX,
  );
  snapshot = next;
  saveRecentEmoji(next);
  for (const listener of listeners) listener();
  return next;
}
