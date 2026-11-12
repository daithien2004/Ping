'use client';

import { MailX } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe, useResendVerification } from '@/features/auth/hooks';
import { useSettingsModal } from '@/features/settings/modal-store';
import { useErrorMessage } from '@/lib/error-message';

/**
 * Banner chưa xác minh email (TG.8) ở đầu app shell: hiện khi `me.emailVerified === false`,
 * ẩn khi đã xác minh. Chính sách lightweight phía API chặn tạo server/mã mời
 * (VERIFY_REQUIRED) — banner nói rõ và cho gửi lại thư ngay (rate limit theo email + IP).
 * Cache `me` được `useVerifyEmail` làm tươi sau khi xác minh nên banner tự tắt.
 */
export function VerifyEmailBanner() {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const resend = useResendVerification();
  const openSettings = useSettingsModal((state) => state.openSettings);

  if (!me || me.emailVerified) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-3 border-b bg-muted px-4 py-2 text-sm text-muted-foreground"
      data-testid="verify-email-banner"
    >
      <MailX className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{t('unverifiedBanner')}</span>
      <PingButton
        size="sm"
        variant="secondary"
        data-testid="verify-email-banner-resend"
        loading={resend.isPending}
        onClick={() =>
          resend.mutate(
            { email: me.email },
            {
              onSuccess: () => pingToast.success(t('resendSent')),
              onError: (error) => pingToast.error(errorMessage(error)),
            },
          )
        }
      >
        {t('resendAction')}
      </PingButton>
      {/* Mở mục Tài khoản trong modal cài đặt (không đổi URL); nhãn tránh chứa chuỗi «Cài đặt»
          (bài học TG.12: va chạm accessible-name với nút Cài đặt của server). */}
      <button
        type="button"
        onClick={() => openSettings('account')}
        className="shrink-0 font-medium underline-offset-4 hover:underline"
      >
        {/* Màu ở span con để nút kế thừa chữ của banner, chỉ nhãn mang màu link. */}
        <span className="text-link">{t('unverifiedBannerMore')}</span>
      </button>
    </div>
  );
}
