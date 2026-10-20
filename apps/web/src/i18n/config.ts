import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export const locales = ['vi', 'en'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'vi';
export const LOCALE_COOKIE = 'locale';

// Hai file nhỏ, nạp sẵn cả hai: không cần tải động, đổi ngôn ngữ là tải lại trang.
export const messagesByLocale = { vi, en } satisfies Record<AppLocale, typeof vi>;

/** Ngôn ngữ từ chuỗi `document.cookie`; giá trị lạ hoặc thiếu → mặc định. */
export function localeFromCookie(cookie: string): AppLocale {
  const value = cookie
    .split('; ')
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return locales.find((locale) => locale === value) ?? defaultLocale;
}

/** Lưu lựa chọn 1 năm rồi tải lại trang: zod, cache, các trang <Activity> đang giữ đều mới. */
export function switchLocale(locale: AppLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
