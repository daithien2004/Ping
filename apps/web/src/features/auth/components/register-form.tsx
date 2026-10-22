'use client';

import { ErrorCodes, registerSchema, type RegisterInput } from '@ping/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect } from 'react';
import { browser } from 'react-dom';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import {
  PingForm,
  PingFormItem,
  usePingForm,
  useResetOnHide,
  zodFormRules,
} from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingPasswordInput } from '@/components/ui/ping-password-input';
import { useMe, useRegister } from '../hooks';
import { safeRedirectPath } from '../session';
import { useErrorMessage } from '@/lib/error-message';

export function RegisterForm() {
  use(browser('Kiểm tra phiên đăng nhập hiện có trong trình duyệt.'));
  const router = useRouter();
  const next = safeRedirectPath(useSearchParams().get('next'));
  const { data: me } = useMe();
  const registerMutation = useRegister();
  const [form] = usePingForm<RegisterInput>();
  useResetOnHide(form);
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();

  // Ô "tên hiển thị" để trống = không đặt (server dùng username): schema không nhận chuỗi rỗng.
  const getValues = (): Record<string, unknown> => {
    const values = form.getFieldsValue();
    const displayName = values.displayName?.trim();
    return { ...values, displayName: displayName || undefined };
  };
  const rules = zodFormRules(registerSchema, getValues);

  useEffect(() => {
    if (me) {
      router.replace(next);
    }
  }, [me, next, router]);

  return (
    <PingForm
      form={form}
      layout="vertical"
      noValidate
      className="flex w-full max-w-sm flex-col"
      onFinish={() => {
        const parsed = registerSchema.safeParse(getValues());
        if (!parsed.success) return;
        registerMutation.mutate(parsed.data);
      }}
    >
      <h1 className="mb-2 text-2xl font-semibold">{t('registerTitle')}</h1>
      <PingFormItem label={t('email')} name="email" rules={rules.email}>
        <PingInput type="email" autoComplete="email" />
      </PingFormItem>
      <PingFormItem label={t('username')} name="username" rules={rules.username}>
        <PingInput autoComplete="username" />
      </PingFormItem>
      <PingFormItem label={t('displayName')} name="displayName" rules={rules.displayName}>
        <PingInput autoComplete="nickname" />
      </PingFormItem>
      <PingFormItem label={t('password')} name="password" rules={rules.password}>
        <PingPasswordInput autoComplete="new-password" />
      </PingFormItem>
      {registerMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(registerMutation.error, {
            [ErrorCodes.CONFLICT]: t('accountTaken'),
          })}
        </p>
      )}
      <PingButton htmlType="submit" size="lg" block loading={registerMutation.isPending}>
        {t('createAccount')}
      </PingButton>
      <p className="mt-2 text-sm">
        {t('haveAccount')}{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-link underline-offset-4 hover:underline"
        >
          {t('login')}
        </Link>
      </p>
    </PingForm>
  );
}
