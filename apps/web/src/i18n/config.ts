import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export const locales = ['vi', 'en'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'vi';
export const LOCALE_COOKIE = 'locale';

// Hai file nhỏ, nạp sẵn cả hai: đổi ngôn ngữ không cần tải động hay tải lại trang (TF.12).
export const messagesByLocale = { vi, en } satisfies Record<AppLocale, typeof vi>;

/** Ngôn ngữ từ chuỗi `document.cookie`; giá trị lạ hoặc thiếu → mặc định. */
export function localeFromCookie(cookie: string): AppLocale {
  const value = cookie
    .split('; ')
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return locales.find((locale) => locale === value) ?? defaultLocale;
}

let liveLocale: AppLocale | null = null;
const localeSubscribers = new Set<() => void>();

/** Ngôn ngữ đang dùng ở client (khởi tạo từ cookie), cập nhật ngay khi đổi — không tải lại trang. */
export function currentLocale(): AppLocale {
  if (liveLocale === null) {
    liveLocale =
      typeof document === 'undefined' ? defaultLocale : localeFromCookie(document.cookie);
  }
  return liveLocale;
}

/** Nguồn ngoài React cho `useSyncExternalStore`: đổi ngôn ngữ phát cho mọi nơi đang đọc. */
export function subscribeLocale(listener: () => void): () => void {
  localeSubscribers.add(listener);
  return () => {
    localeSubscribers.delete(listener);
  };
}

/** Lưu lựa chọn 1 năm và phát ngay cho provider — không reload (TF.12). */
export function switchLocale(locale: AppLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  liveLocale = locale;
  for (const listener of localeSubscribers) listener();
}
