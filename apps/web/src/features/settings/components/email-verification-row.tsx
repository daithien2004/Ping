'use client';

import { Mail } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingTag } from '@/components/ui/ping-tag';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe, useResendVerification } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/error-message';

/**
 * Email + trạng thái xác minh (TG.8): badge xanh khi đã xác minh; chưa xác minh thì hiện nút
 * gửi lại thư (POST /auth/verify-email/resend, rate limit theo email + IP ở API). Người dùng
 * chưa xác minh vẫn đăng nhập bình thường, chỉ bị chặn tạo server/mã mời (VERIFY_REQUIRED).
 */
export function EmailVerificationRow() {
  const t = useTranslations('settings.account');
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const resend = useResendVerification();

  if (!me) return null;

  const resendOptions = {
    onSuccess: () => pingToast.success(t('resendSentToast')),
    onError: (error: unknown) => pingToast.error(errorMessage(error)),
  };

  return (
    <div className="flex items-center justify-between gap-4" data-testid="settings-email-row">
      <div className="flex min-w-0 items-center gap-3">
        <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{t('email')}</span>
          <span className="truncate text-xs text-muted-foreground">{me.email}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {me.emailVerified ? (
          <PingTag color="green" data-testid="settings-email-verified">
            {t('verifiedBadge')}
          </PingTag>
        ) : (
          <>
            <PingTag data-testid="settings-email-unverified">{t('unverifiedBadge')}</PingTag>
            <PingButton
              size="sm"
              variant="secondary"
              data-testid="settings-resend-verification"
              loading={resend.isPending}
              onClick={() => resend.mutate({ email: me.email }, resendOptions)}
            >
              {t('resendVerification')}
            </PingButton>
          </>
        )}
      </div>
    </div>
  );
}
