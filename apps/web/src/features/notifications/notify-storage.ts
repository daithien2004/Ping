/**
 * Cài đặt THIẾT BỊ của TG.12 (không đồng bộ qua server — thuộc client): bỏ qua @everyone và
 * âm thanh. localStorage key mới, đọc ở thời điểm event nên đổi toggle không cần báo realtime.
 */
const IGNORE_EVERYONE_KEY = 'ping.notify.ignore-everyone';
const SOUND_KEY = 'ping.notify.sound';

const readFlag = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    // localStorage có thể bị chặn (người dùng tắt cookie) — rơi về mặc định, không nổi lỗi.
    return fallback;
  }
};

const writeFlag = (key: string, value: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Như trên: không ghi được thì cài đặt chỉ sống trong phiên.
  }
};

/** Bỏ qua @everyone/@here khi quyết định thông báo (mặc định TẮT — nghe đủ). */
export const readIgnoreEveryone = () => readFlag(IGNORE_EVERYONE_KEY, false);
export const writeIgnoreEveryone = (value: boolean) => writeFlag(IGNORE_EVERYONE_KEY, value);

/** Âm thanh khi bắn thông báo (mặc định BẬT theo plan TG.12). */
export const readSoundEnabled = () => readFlag(SOUND_KEY, true);
export const writeSoundEnabled = (value: boolean) => writeFlag(SOUND_KEY, value);
