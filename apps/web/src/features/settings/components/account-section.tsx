'use client';

import { Lock, Mail, MonitorSmartphone } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useMe } from '@/features/auth/hooks';
import { SelfProfileCard } from '@/features/profile/components/profile-popover';
import { SettingsSection } from './settings-section';

/**
 * Tài khoản (TG.13): hồ sơ tái dùng nguyên thẻ TG.7 (`SelfProfileCard` — đổi ảnh đại diện
 * pipeline TG.6 + tên hiển thị). Email/mật khẩu/phiên là placeholder tắt điều hướng: TG.8
 * chưa làm, KHÔNG dựng UI giả có hình thức bấm được.
 */
export function AccountSection() {
  const t = useTranslations('settings.account');
  const { data: me } = useMe();

  const placeholders = [
    { icon: Mail, label: t('email'), value: me?.email ?? '', hint: t('comingSoon') },
    { icon: Lock, label: t('password'), value: '••••••••', hint: t('comingSoon') },
    { icon: MonitorSmartphone, label: t('sessions'), value: '', hint: t('comingSoon') },
  ];

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-account">
      <div className="flex max-w-2xl flex-col gap-6">
        <section aria-label={t('profileTitle')} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t('profileTitle')}</h2>
          <SelfProfileCard />
        </section>

        <section aria-label={t('credentialsTitle')} className="flex flex-col">
          <h2 className="text-sm font-semibold">{t('credentialsTitle')}</h2>
          <ul className="flex flex-col divide-y divide-border">
            {placeholders.map(({ icon: Icon, label, value, hint }) => (
              <li key={label} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{label}</span>
                    {value ? (
                      <span className="truncate text-xs text-muted-foreground">{value}</span>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SettingsSection>
  );
}
