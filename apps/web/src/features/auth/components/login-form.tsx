'use client';

import { ErrorCodes, loginSchema, type LoginInput } from '@ping/shared';
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
import { useMe, useLogin } from '../hooks';
import { safeRedirectPath } from '../session';
import { useErrorMessage } from '@/lib/error-message';

/** Tên trường cố định của form (dùng khi xoá lúc trang bị ẩn). */
const LOGIN_FIELDS = ['email', 'password'] as const;

export function LoginForm() {
  use(browser('Kiểm tra phiên đăng nhập hiện có trong trình duyệt.'));
  const router = useRouter();
  const next = safeRedirectPath(useSearchParams().get('next'));
  const { data: me } = useMe();
  const loginMutation = useLogin();
  const [form] = usePingForm<LoginInput>();
  const containerRef = useResetOnHide(form, LOGIN_FIELDS);
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  // Cùng schema với API (packages/shared): lỗi định dạng báo ngay, không tốn một request.
  const rules = zodFormRules(loginSchema, () => form.getFieldsValue());

  // Đã đăng nhập (vừa đăng nhập xong, hoặc mở /login khi phiên còn) → vào app.
  useEffect(() => {
    if (me) {
      router.replace(next);
    }
  }, [me, next, router]);

  return (
    <div ref={containerRef} className="flex w-full max-w-sm flex-col">
      <PingForm
        form={form}
        layout="vertical"
        noValidate
        className="flex flex-col"
        onFinish={(values) => {
          const parsed = loginSchema.safeParse(values);
          if (!parsed.success) return;
          loginMutation.mutate(parsed.data);
        }}
      >
        <h1 className="mb-2 text-2xl font-semibold">{t('loginTitle')}</h1>
        <PingFormItem label={t('email')} name="email" rules={rules.email}>
          <PingInput type="email" autoComplete="email" />
        </PingFormItem>
        <PingFormItem label={t('password')} name="password" rules={rules.password}>
          <PingPasswordInput autoComplete="current-password" />
        </PingFormItem>
        {loginMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(loginMutation.error, {
              [ErrorCodes.UNAUTHORIZED]: t('wrongCredentials'),
            })}
          </p>
        )}
        <PingButton htmlType="submit" size="lg" block loading={loginMutation.isPending}>
          {t('login')}
        </PingButton>
        <p className="mt-2 text-sm">
          {t('noAccount')}{' '}
          <Link
            href={`/register?next=${encodeURIComponent(next)}`}
            className="font-medium text-link underline-offset-4 hover:underline"
          >
            {t('register')}
          </Link>
        </p>
      </PingForm>
    </div>
  );
}
