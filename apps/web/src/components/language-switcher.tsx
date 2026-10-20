'use client';

import { useLocale, useTranslations } from 'use-intl';
import { locales, switchLocale, type AppLocale } from '@/i18n/config';

/** Chọn ngôn ngữ. `<select>` gốc: có sẵn bàn phím, trình đọc màn hình, không cần thư viện. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  return (
    <select
      aria-label={t('language')}
      value={locale}
      onChange={(event) => switchLocale(event.target.value as AppLocale)}
      className={`rounded bg-transparent text-xs ${className}`}
    >
      {locales.map((option) => (
        <option key={option} value={option}>
          {t(`languages.${option}`)}
        </option>
      ))}
    </select>
  );
}
