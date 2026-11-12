import type { Query, QueryClient } from '@tanstack/react-query';
import { qk } from './query-keys';

/**
 * Giữ lại cache "khung" (me, server, channel, quyền, DM, unread, cài đặt) trong localStorage
 * để F5 vẽ được rail + sidebar + tên kênh ngay từ khung HTML thay vì đợi mạng — cùng ý tưởng
 * cache cục bộ của Discord: mở app lại là khung cũ hiện trước, dữ liệu mới về sau.
 *
 * Chỉ các query nhẹ, cấu trúc mới lưu. Tin nhắn KHÔNG lưu: cache tin là infinite pages, dễ
 * phình dung lượng và lệch với cửa sổ permalink; tin vẫn tải qua Suspense như hiện tại.
 * Lưu hỏng/quá hạn/chế độ riêng tư đều bị bỏ qua im lặng — đây chỉ là tăng tốc, không phải
 * nguồn dữ liệu.
 */
const STORAGE_KEY = 'ping:query-cache';
const VERSION = 1;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 500;

interface PersistedQuery {
  key: readonly unknown[];
  data: unknown;
  dataUpdatedAt: number;
}

interface PersistedCache {
  version: number;
  savedAt: number;
  queries: PersistedQuery[];
}

/** Tiền tố được phép lưu; mọi nhánh khác (tin nhắn, thành viên, tìm kiếm…) bỏ qua. */
function isPersistable(key: readonly unknown[]): boolean {
  const [root, , third] = key;
  switch (root) {
    case 'me':
    case 'dms':
    case 'unread':
    case 'settings':
    case 'notification-prefs':
    case 'privacy':
      return true;
    case 'servers':
      // Danh sách server, chi tiết một server, channel và quyền — đủ để vẽ khung; biểu cảm
      // (emoji/sticker) lưu kèm để picker mở ra là có dữ liệu ngay sau F5.
      return (
        key.length <= 2 ||
        third === 'channels' ||
        third === 'permissions' ||
        third === 'emojis' ||
        third === 'stickers'
      );
    default:
      return false;
  }
}

function hasData(query: Query): boolean {
  // `me === null` là "chưa đăng nhập": lưu lại chỉ làm tab sau tưởng đã có phiên.
  return query.state.data != null && isPersistable(query.queryKey);
}

function read(): PersistedCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCache;
    if (parsed?.version !== VERSION) return null;
    if (!Array.isArray(parsed.queries) || parsed.queries.length === 0) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(queryClient: QueryClient) {
  try {
    const queries = queryClient
      .getQueryCache()
      .getAll()
      .filter(hasData)
      .map((query): PersistedQuery => ({
        key: query.queryKey,
        data: query.state.data,
        dataUpdatedAt: query.state.dataUpdatedAt,
      }));
    if (queries.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: PersistedCache = { version: VERSION, savedAt: Date.now(), queries };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Hết quota / chế độ riêng tư: bỏ qua, lần mở sau chỉ chậm hơn chút.
  }
}

/** Nạp lại cache đã lưu ngay khi client được tạo, trước lần render đầu tiên. */
export function hydratePersistedQueries(queryClient: QueryClient) {
  const stored = read();
  if (!stored) return;
  for (const entry of stored.queries) {
    if (!Array.isArray(entry.key) || entry.data == null) continue;
    if (!isPersistable(entry.key)) continue;
    // `updatedAt: 0` = coi mọi bản lưu là CŨ. Người dùng vẫn thấy khung ngay, nhưng query
    // mount lên là refetch nền liền thay vì coi dữ liệu cũ còn "tươi" 30 giây. Quan trọng với
    // quyền: thành viên vừa được cấp/thu quyền ở nơi khác phải thấy UI đổi ngay sau F5.
    queryClient.setQueryData(entry.key, entry.data, { updatedAt: 0 });
  }
  // `me` có staleTime Infinity nên `updatedAt: 0` vẫn không đủ làm nó cũ; invalidate để lần
  // mount đầu refetch nền — người dùng thấy khung ngay, phiên hết hạn vẫn bị phát hiện.
  void queryClient.invalidateQueries({ queryKey: qk.me });
}

let started = false;

/** Ghi lại cache mỗi khi dữ liệu khung đổi (gộp 500ms) và lúc tab bị ẩn/đóng. */
export function startPersistingQueries(queryClient: QueryClient) {
  if (started) return;
  started = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => write(queryClient), WRITE_DELAY_MS);
  };

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'removed') {
      schedule();
      return;
    }
    if (event.type !== 'updated') return;
    // Chỉ ghi khi dữ liệu thật sự đổi; 'fetch'/'invalidate' gần như luôn kéo theo 'success'.
    if (event.action.type === 'success' || event.action.type === 'setState') schedule();
  });

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    write(queryClient);
  };
  window.addEventListener('pagehide', flush);
}

/** Đăng xuất / phiên hết hạn: xóa luôn bản lưu — người tiếp theo không thấy dữ liệu cũ. */
export function clearPersistedQueries() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Không xóa được thì removeQueries phía sau vẫn dọn cache trong bộ nhớ.
  }
}
