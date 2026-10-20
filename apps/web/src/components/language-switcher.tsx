'use client';

import { useLocale, useTranslations } from 'use-intl';
import { locales, switchLocale, type AppLocale } from '@/i18n/config';

/**
 * Chọn ngôn ngữ. `<select>` gốc: có sẵn bàn phím, trình đọc màn hình, không cần thư viện.
 * `compact` (rail 72px): hiện mã VI/EN thay cho tên đầy đủ; tên truy cập vẫn là "Ngôn ngữ".
 */
export function LanguageSwitcher({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  return (
    <select
      aria-label={t('language')}
      value={locale}
      onChange={(event) => switchLocale(event.target.value as AppLocale)}
      className={`rounded-md border border-input bg-background px-1 py-0.5 text-xs text-foreground ${className}`}
    >
      {locales.map((option) => (
        <option key={option} value={option}>
          {compact ? option.toUpperCase() : t(`languages.${option}`)}
        </option>
      ))}
    </select>
  );
}
