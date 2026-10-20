'use client';

import { ErrorCodes, loginSchema } from '@ping/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';
import { browser } from 'react-dom';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useLogin, useMe } from '../hooks';
import { safeRedirectPath } from '../session';
import { Field, FormError, SubmitButton, useClearOnHide } from '@/components/form-parts';
import { useErrorMessage } from '@/lib/error-message';

type FieldErrors = Partial<Record<'email' | 'password', string[]>>;

export function LoginForm() {
  use(browser('Kiểm tra phiên đăng nhập hiện có trong trình duyệt.'));
  const router = useRouter();
  const next = safeRedirectPath(useSearchParams().get('next'));
  const { data: me } = useMe();
  const loginMutation = useLogin();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useClearOnHide();
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();

  // Đã đăng nhập (vừa đăng nhập xong, hoặc mở /login khi phiên còn) → vào app.
  useEffect(() => {
    if (me) {
      router.replace(next);
    }
  }, [me, next, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // Cùng schema với API (packages/shared): lỗi định dạng báo ngay, không tốn một request.
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors({});
    loginMutation.mutate(parsed.data);
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
      <Field
        label={t('email')}
        name="email"
        type="email"
        autoComplete="email"
        errors={fieldErrors.email}
      />
      <Field
        label={t('password')}
        name="password"
        type="password"
        autoComplete="current-password"
        errors={fieldErrors.password}
      />
      {loginMutation.isError && (
        <FormError>
          {errorMessage(loginMutation.error, {
            [ErrorCodes.UNAUTHORIZED]: t('wrongCredentials'),
          })}
        </FormError>
      )}
      <SubmitButton pending={loginMutation.isPending}>{t('login')}</SubmitButton>
      <p className="text-sm">
        {t('noAccount')}{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="underline">
          {t('register')}
        </Link>
      </p>
    </form>
  );
}
