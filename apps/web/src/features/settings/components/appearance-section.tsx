'use client';

import { SETTINGS_DENSITIES, SETTINGS_FONT_SIZES } from '@ping/shared';
import type { SettingsDensity, SettingsFontSize, SettingsTheme } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingSegmented } from '@/components/ui/ping-segmented';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { palette } from '@/lib/theme';
import { parseSkin, PIXEL_SKIN_ENABLED } from '@/lib/theme/skin';
import { usePatchSettings, useUserSettings } from '../hooks';
import { useAppliedSettings } from '../store';
import { SettingsSection } from './settings-section';

/**
 * Ô xem trước theme trong lựa chọn: nền/điểm nhấn của mode ĐÍCH (không phải mode hiện tại)
 * — hex lấy từ palette nguồn duy nhất của web (lib/theme/tokens.ts), không phải màu mới.
 */
function ThemePreview({ mode }: { mode: 'light' | 'dark' | 'system' }) {
  const dark = palette.ink[950];
  const light = palette.white;
  const background =
    mode === 'dark'
      ? dark
      : mode === 'light'
        ? light
        : `linear-gradient(90deg, ${light} 50%, ${dark} 50%)`;
  return (
    <span
      aria-hidden
      className="inline-flex size-4 items-center justify-center rounded-full border border-border"
      style={{ background }}
    >
      <span className="size-1.5 rounded-full" style={{ background: palette.violet[500] }} />
    </span>
  );
}

/**
 * Giao diện (TG.13): chủ đề sáng/tối/hệ thống, mật độ tin nhắn, cỡ chữ — mọi lựa chọn patch
 * NGAY khi đổi (`usePatchSettings` áp dụng optimistically lên <html> rồi lưu server).
 * Danh sách giá trị lấy từ hằng shared nên UI không cho chọn gì ngoài những gì API nhận.
 */
export function AppearanceSection() {
  const t = useTranslations('settings.appearance');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const patch = usePatchSettings();
  // Skin (ADR-0076) là lựa chọn của THIẾT BỊ: đổi ngay trong store/cookie, không PATCH server.
  const skin = useAppliedSettings((state) => state.skin);
  const applySettings = useAppliedSettings((state) => state.apply);
  // Giá trị hiện hành từ cache (PATCH ghi optimistically nên segmented đổi ngay khi bấm).
  const { data: settings, isError, refetch } = useUserSettings();
  // PATCH hoàn nguyên giá trị cũ khi lỗi; báo toast để người dùng biết lựa chọn chưa lưu được.
  const save = (values: Parameters<typeof patch.mutate>[0]) =>
    patch.mutate(values, { onError: (error) => pingToast.error(errorMessage(error)) });

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-appearance">
      <div className="flex max-w-xl flex-col gap-4">
        {isError && (
          <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
            {t('loadFailed')}
            <PingButton size="sm" variant="secondary" onClick={() => void refetch()}>
              {tc('retry')}
            </PingButton>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" id="settings-theme-label">
            {t('theme')}
          </span>
          <PingSegmented
            aria-labelledby="settings-theme-label"
            value={settings?.theme}
            options={[
              {
                value: 'light',
                label: (
                  <span className="flex items-center gap-1.5" data-testid="settings-theme-light">
                    <ThemePreview mode="light" />
                    {t('themeLight')}
                  </span>
                ),
              },
              {
                value: 'dark',
                label: (
                  <span className="flex items-center gap-1.5" data-testid="settings-theme-dark">
                    <ThemePreview mode="dark" />
                    {t('themeDark')}
                  </span>
                ),
              },
              {
                value: 'system',
                label: (
                  <span className="flex items-center gap-1.5" data-testid="settings-theme-system">
                    <ThemePreview mode="system" />
                    {t('themeSystem')}
                  </span>
                ),
              },
            ]}
            onChange={(value) => save({ theme: value as SettingsTheme })}
          />
          <p className="text-xs text-muted-foreground">{t('themeHint')}</p>
        </div>

        {PIXEL_SKIN_ENABLED && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id="settings-skin-label">
              {t('skin')}
            </span>
            <PingSegmented
              aria-labelledby="settings-skin-label"
              value={skin}
              options={[
                {
                  value: 'default',
                  label: <span data-testid="settings-skin-default">{t('skinDefault')}</span>,
                },
                {
                  value: 'pixel',
                  label: <span data-testid="settings-skin-pixel">{t('skinPixel')}</span>,
                },
                {
                  value: 'pop',
                  label: <span data-testid="settings-skin-pop">{t('skinPop')}</span>,
                },
              ]}
              onChange={(value) => applySettings({ skin: parseSkin(String(value)) })}
            />
            <p className="text-xs text-muted-foreground">{t('skinHint')}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" id="settings-density-label">
            {t('density')}
          </span>
          <PingSegmented
            aria-labelledby="settings-density-label"
            value={settings?.density}
            options={SETTINGS_DENSITIES.map((value) => ({
              value,
              label: (
                <span data-testid={`settings-density-${value}`}>
                  {value === 'comfortable' ? t('densityComfortable') : t('densityCompact')}
                </span>
              ),
            }))}
            onChange={(value) => save({ density: value as SettingsDensity })}
          />
          <p className="text-xs text-muted-foreground">{t('densityHint')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" id="settings-font-size-label">
            {t('fontSize')}
          </span>
          <PingSegmented
            aria-labelledby="settings-font-size-label"
            value={settings?.fontSize}
            options={SETTINGS_FONT_SIZES.map((value) => ({
              value,
              label: (
                <span data-testid={`settings-font-${value}`}>
                  {value === 'sm'
                    ? t('fontSizeSm')
                    : value === 'md'
                      ? t('fontSizeMd')
                      : t('fontSizeLg')}
                </span>
              ),
            }))}
            onChange={(value) => save({ fontSize: value as SettingsFontSize })}
          />
          <p className="text-xs text-muted-foreground">{t('fontSizeHint')}</p>
        </div>
      </div>
    </SettingsSection>
  );
}
