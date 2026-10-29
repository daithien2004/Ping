'use client';

import { useTranslations } from 'use-intl';
import { SelfProfileCard } from '@/features/profile/components/profile-popover';
import { ChangePasswordForm } from './change-password-form';
import { EmailVerificationRow } from './email-verification-row';
import { SessionsList } from './sessions-list';
import { SettingsSection } from './settings-section';

/**
 * Tài khoản (TG.8): hồ sơ tái dùng thẻ TG.7 (`SelfProfileCard`), thêm email + trạng thái xác
 * minh, đổi mật khẩu và danh sách phiên đăng nhập — thay placeholder «sắp có» của TG.13.
 * Mọi thay đổi áp dụng ngay (toast + cache được hook invalidate) và có bản dịch vi/en.
 */
export function AccountSection() {
  const t = useTranslations('settings.account');

  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-account">
      <div className="flex max-w-2xl flex-col gap-8">
        <section aria-label={t('profileTitle')} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t('profileTitle')}</h2>
          <SelfProfileCard />
        </section>
        <section aria-label={t('email')} className="flex flex-col">
          <h2 className="mb-2 text-sm font-semibold">{t('email')}</h2>
          <EmailVerificationRow />
        </section>

        <section aria-label={t('changePasswordTitle')} className="flex flex-col">
          <h2 className="mb-2 text-sm font-semibold">{t('changePasswordTitle')}</h2>
          <ChangePasswordForm />
        </section>

        <SessionsList />
      </div>
    </SettingsSection>
  );
}
