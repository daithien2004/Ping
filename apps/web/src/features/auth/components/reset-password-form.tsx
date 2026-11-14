'use client';

import { resetPasswordSchema } from '@ping/shared';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingPasswordInput } from '@/components/ui/ping-password-input';
import { useErrorMessage } from '@/lib/error-message';
import { useResetPassword } from '../hooks';

type ResetPasswordValues = {
  password: string;
  confirmPassword: string;
};

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [form] = usePingForm<ResetPasswordValues>();
  const reset = useResetPassword();
  const rules = zodFormRules(resetPasswordSchema.pick({ password: true }), () =>
    form.getFieldsValue(),
  );

  if (!token) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold">{t('resetTitle')}</h1>
        <p role="alert" className="text-sm text-muted-foreground" data-testid="reset-missing-token">
          {t('verifyNoToken')}
        </p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          <span className="text-link">{t('forgotTitle')}</span>
        </Link>
      </div>
    );
  }

  if (reset.isSuccess) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-online" aria-hidden />
        <h1 className="text-2xl font-semibold">{t('resetSuccessTitle')}</h1>
        <p className="text-sm text-muted-foreground" data-testid="reset-success">
          {t('resetSuccess')}
        </p>
        <PingButton
          variant="primary"
          size="lg"
          block
          data-testid="reset-go-login"
          onClick={() => router.push('/login')}
        >
          {t('resetLogin')}
        </PingButton>
      </div>
    );
  }

  return (
    <PingForm
      form={form}
      // `password`, tránh trùng id khiến label trỏ nhầm ô.
      name="resetPassword"
      layout="vertical"
      noValidate
      className="flex w-full max-w-sm flex-col"
      onFinish={(values) => {
        const parsed = resetPasswordSchema.pick({ password: true }).safeParse(values);
        if (!parsed.success) return;
        reset.mutate({ token, password: parsed.data.password });
      }}
    >
      <h1 className="mb-2 text-2xl font-semibold">{t('resetTitle')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t('resetHint')}</p>
      <PingFormItem label={t('newPassword')} name="password" rules={rules.password}>
        <PingPasswordInput autoComplete="new-password" />
      </PingFormItem>
      <PingFormItem
        label={t('confirmNewPassword')}
        name="confirmPassword"
        dependencies={['password']}
        rules={[
          {
            validator: (_rule, value: string) =>
              value === form.getFieldValue('password')
                ? Promise.resolve()
                : Promise.reject(new Error(t('passwordMismatch'))),
          },
        ]}
      >
        <PingPasswordInput autoComplete="new-password" />
      </PingFormItem>
      {reset.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(reset.error)}
        </p>
      )}
      <PingButton variant="primary" htmlType="submit" size="lg" block loading={reset.isPending}>
        {t('resetSubmit')}
      </PingButton>
      <p className="mt-2 text-sm">
        <Link href="/login" className="font-medium underline-offset-4 hover:underline">
          <span className="text-link">{t('backToLogin')}</span>
        </Link>
      </p>
    </PingForm>
  );
}
