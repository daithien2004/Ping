import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export const locales = ['vi', 'en'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'vi';
export const LOCALE_COOKIE = 'locale';

export const messagesByLocale = { vi, en } satisfies Record<AppLocale, typeof vi>;

export function localeFromCookie(cookie: string): AppLocale {
  const value = cookie
    .split('; ')
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return locales.find((locale) => locale === value) ?? defaultLocale;
}

let liveLocale: AppLocale | null = null;
const localeSubscribers = new Set<() => void>();

export function currentLocale(): AppLocale {
  if (liveLocale === null) {
    liveLocale =
      typeof document === 'undefined' ? defaultLocale : localeFromCookie(document.cookie);
  }
  return liveLocale;
}

export function subscribeLocale(listener: () => void): () => void {
  localeSubscribers.add(listener);
  return () => {
    localeSubscribers.delete(listener);
  };
}

export function switchLocale(locale: AppLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  liveLocale = locale;
  for (const listener of localeSubscribers) listener();
}
