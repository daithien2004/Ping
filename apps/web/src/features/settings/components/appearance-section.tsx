'use client';

import { SETTINGS_DENSITIES, SETTINGS_FONT_SIZES } from '@ping/shared';
import type { SettingsDensity, SettingsFontSize, SettingsTheme } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingSegmented } from '@/components/ui/ping-segmented';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { palette } from '@/lib/theme';
import { usePatchSettings, useUserSettings } from '../hooks';
import { SettingsSection } from './settings-section';

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

export function AppearanceSection() {
  const t = useTranslations('settings.appearance');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const patch = usePatchSettings();
  const { data: settings, isError, refetch } = useUserSettings();
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
