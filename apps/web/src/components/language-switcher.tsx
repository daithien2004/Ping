'use client';

import { useLocale, useTranslations } from 'use-intl';
import { locales, switchLocale } from '@/i18n/config';

/**
 * Công tắc ngôn ngữ VI | EN. Là nhóm radio gốc (`<input type="radio">` ẩn về mặt thị giác): có sẵn
 * bàn phím (mũi tên), tên truy cập và trạng thái cho trình đọc màn hình mà không cần thư viện.
 * Nhãn hiện mã VI/EN cho gọn; tên truy cập của từng nút vẫn là tên đầy đủ ("Tiếng Việt").
 * `vertical`: xếp dọc, dùng ở rail hẹp.
 */
export function LanguageSwitcher({
  className = '',
  vertical = false,
}: {
  className?: string;
  vertical?: boolean;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  return (
    <div
      role="radiogroup"
      aria-label={t('language')}
      data-slot="language-switcher"
      className={`inline-flex gap-0.5 rounded-md border border-border-strong bg-background p-0.5 text-xs ${vertical ? 'flex-col' : ''} ${className}`}
    >
      {locales.map((option) => (
        <label key={option} className="cursor-pointer">
          <input
            type="radio"
            name="ping-locale"
            value={option}
            checked={locale === option}
            onChange={() => switchLocale(option)}
            aria-label={t(`languages.${option}`)}
            className="peer sr-only"
          />
          <span className="block rounded-sm px-2 py-0.5 text-center font-medium text-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
            {option.toUpperCase()}
          </span>
        </label>
      ))}
    </div>
  );
}
