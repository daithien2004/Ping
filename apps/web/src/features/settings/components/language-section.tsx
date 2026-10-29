'use client';

import type { AppLocale } from '@/i18n/config';
import { locales, switchLocale } from '@/i18n/config';
import { useLocale, useTranslations } from 'use-intl';
import { pingToast } from '@/components/ui/ping-toast';
import { PingSegmented } from '@/components/ui/ping-segmented';
import { useErrorMessage } from '@/lib/error-message';
import { usePatchSettings } from '../hooks';
import { SettingsSection } from './settings-section';

/**
 * Ngôn ngữ (TG.13): lựa chọn lưu lên server (đồng bộ thiết bị) VÀ ghi cookie hiện có của
 * i18n rồi tải lại trang — Next server components đọc cookie để dịch, không reload thì
 * chữ không đổi. PATCH xong mới reload: lỗi lưu thì giữ nguyên trang, không nhảy ngôn ngữ.
 * Bản dịch hiển thị tên ngôn ngữ bằng chính ngôn ngữ đó (kiểu phổ biến của app chat).
 */
const NATIVE_NAMES: Record<AppLocale, string> = { vi: 'Tiếng Việt', en: 'English' };

export function LanguageSection() {
  const t = useTranslations('settings.language');
  const locale = useLocale();
  const patch = usePatchSettings();
  const errorMessage = useErrorMessage();

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-language">
      <div className="flex max-w-xl flex-col gap-2">
        <span className="text-sm font-medium" id="settings-locale-label">
          {t('language')}
        </span>
        <PingSegmented
          aria-labelledby="settings-locale-label"
          options={locales.map((value) => ({
            value,
            label: <span data-testid={`settings-locale-${value}`}>{NATIVE_NAMES[value]}</span>,
          }))}
          value={locale}
          onChange={(value) => {
            const next = value as AppLocale;
            patch.mutate(
              { locale: next },
              {
                onSuccess: () => switchLocale(next),
                onError: (error) => pingToast.error(errorMessage(error)),
              },
            );
          }}
        />
        <p className="text-xs text-muted-foreground">{t('syncHint')}</p>
      </div>
    </SettingsSection>
  );
}
