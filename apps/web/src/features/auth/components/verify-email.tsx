'use client';

import { resendVerificationSchema, type ResendVerificationInput } from '@ping/shared';
import { BadgeCheck, MailX } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { useErrorMessage } from '@/lib/error-message';
import { useResendVerification, useVerifyEmail } from '../hooks';

/**
 * Trang xác minh email công khai (TG.8): mở từ liên kết trong thư `/verify?token=...`.
 * Token một lần — hết hạn/đã dùng thì hiện nút «Gửi lại thư» mở form email. Trang không cần
 * đăng nhập; nếu người dùng vẫn đang đăng nhập (xác minh ngay sau đăng ký), hook
 * `useVerifyEmail` tự làm tươi `me` để banner chưa xác minh tắt.
 */
export function VerifyEmailPanel() {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const token = useSearchParams().get('token');
  const verify = useVerifyEmail();
  const [showResend, setShowResend] = useState(false);

  // Chạy đúng MỘT lần cho mỗi lần vào trang: StrictMode (dev) gọi effect hai lần và token là
  // một-lần-dùng — lần gọi thứ hai sẽ báo VERIFY_TOKEN_INVALID đè lên trạng thái thành công.
  const startedRef = useRef(false);
  const { mutate: mutateVerify } = verify;
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (token) {
      mutateVerify({ token });
    }
  }, [token, mutateVerify]);

  if (!token) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <MailX className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold">{t('verifyTitle')}</h1>
        <p
          role="alert"
          className="text-sm text-muted-foreground"
          data-testid="verify-missing-token"
        >
          {t('verifyNoToken')}
        </p>
        <ResendSection open={showResend} onOpen={() => setShowResend(true)} />
        <BackToLoginLink />
      </div>
    );
  }

  if (verify.isSuccess) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <BadgeCheck className="size-10 text-online" aria-hidden />
        <h1 className="text-2xl font-semibold">{t('verifySuccessTitle')}</h1>
        <p className="text-sm text-muted-foreground" data-testid="verify-success">
          {t('verifySuccess')}
        </p>
        <PingButton
          size="lg"
          block
          data-testid="verify-go-login"
          onClick={() => router.push('/login')}
        >
          {t('verifyGoLogin')}
        </PingButton>
      </div>
    );
  }

  if (verify.isError) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <MailX className="size-10 text-destructive" aria-hidden />
        <h1 className="text-2xl font-semibold">{t('verifyTitle')}</h1>
        <p role="alert" className="text-sm text-destructive" data-testid="verify-error">
          {errorMessage(verify.error)}
        </p>
        <ResendSection open={showResend} onOpen={() => setShowResend(true)} />
        <BackToLoginLink />
      </div>
    );
  }

  // Đang gọi API (cả trạng thái chưa kịp gọi): hiện chờ, không có gì bấm được.
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">{t('verifyTitle')}</h1>
      <p aria-live="polite" className="text-sm text-muted-foreground" data-testid="verify-checking">
        {t('verifyChecking')}
      </p>
    </div>
  );
}

/** Nút «Gửi lại thư» hoặc form email đã mở — dùng chung cho trạng thái thiếu/sai token. */
function ResendSection({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<ResendVerificationInput>();
  const resend = useResendVerification();
  const rules = zodFormRules(resendVerificationSchema, () => form.getFieldsValue());

  if (!open) {
    return (
      <PingButton variant="secondary" data-testid="verify-resend-open" onClick={onOpen}>
        {t('resendAction')}
      </PingButton>
    );
  }

  if (resend.isSuccess) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="verify-resent">
        {t('resendSent')}
      </p>
    );
  }

  return (
    <PingForm
      form={form}
      layout="vertical"
      noValidate
      className="flex w-full flex-col"
      data-testid="verify-resend-form"
      onFinish={(values) => {
        const parsed = resendVerificationSchema.safeParse(values);
        if (!parsed.success) return;
        resend.mutate(parsed.data);
      }}
    >
      <h2 className="text-sm font-semibold">{t('verifyResendTitle')}</h2>
      <p className="mb-2 text-xs text-muted-foreground">{t('verifyResendHint')}</p>
      <PingFormItem label={t('email')} name="email" rules={rules.email}>
        <PingInput type="email" autoComplete="email" />
      </PingFormItem>
      {resend.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(resend.error)}
        </p>
      )}
      <PingButton htmlType="submit" block loading={resend.isPending}>
        {t('resendAction')}
      </PingButton>
    </PingForm>
  );
}

function BackToLoginLink() {
  const t = useTranslations('auth');
  return (
    <Link
      href="/login"
      className="text-sm font-medium text-link underline-offset-4 hover:underline"
    >
      {t('backToLogin')}
    </Link>
  );
}
