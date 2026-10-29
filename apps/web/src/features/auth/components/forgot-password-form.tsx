'use client';

import { forgotPasswordSchema, type ForgotPasswordInput } from '@ping/shared';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { useErrorMessage } from '@/lib/error-message';
import { useForgotPassword } from '../hooks';

/**
 * Quên mật khẩu (TG.8): nhập email → server LUÔN trả 202 bất kể email có tồn tại. UI hiển thị
 * đúng một câu trung lập sau khi gửi để không lộ email nào đã đăng ký (chống dò tài khoản).
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<ForgotPasswordInput>();
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(false);
  const rules = zodFormRules(forgotPasswordSchema, () => form.getFieldsValue());

  if (sent && forgot.isSuccess) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-online" aria-hidden />
        <h1 className="text-2xl font-semibold">{t('forgotSentTitle')}</h1>
        <p className="text-sm text-muted-foreground" data-testid="forgot-sent">
          {t('forgotSent')}
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <PingForm
      form={form}
      layout="vertical"
      noValidate
      className="flex w-full max-w-sm flex-col"
      onFinish={(values) => {
        const parsed = forgotPasswordSchema.safeParse(values);
        if (!parsed.success) return;
        forgot.mutate(parsed.data, { onSuccess: () => setSent(true) });
      }}
    >
      <h1 className="mb-2 text-2xl font-semibold">{t('forgotTitle')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t('forgotHint')}</p>
      <PingFormItem label={t('email')} name="email" rules={rules.email}>
        <PingInput type="email" autoComplete="email" />
      </PingFormItem>
      {forgot.isError && (
        <p role="alert" className="text-sm text-destructive">
          {/* Lỗi hạ tầng/rate limit — câu lỗi theo mã, không tiết lộ trạng thái email. */}
          {errorMessage(forgot.error)}
        </p>
      )}
      <PingButton htmlType="submit" size="lg" block loading={forgot.isPending}>
        {t('forgotSend')}
      </PingButton>
      <p className="mt-2 text-sm">
        <Link href="/login" className="font-medium text-link underline-offset-4 hover:underline">
          {t('backToLogin')}
        </Link>
      </p>
    </PingForm>
  );
}
