'use client';

import { ErrorCodes, registerSchema } from '@ping/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';
import { browser } from 'react-dom';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useMe, useRegister } from '../hooks';
import { safeRedirectPath } from '../session';
import { Field, FormError, SubmitButton, useClearOnHide } from '@/components/form-parts';
import { useErrorMessage } from '@/lib/error-message';

type FieldErrors = Partial<Record<'email' | 'username' | 'password' | 'displayName', string[]>>;

export function RegisterForm() {
  use(browser('Kiểm tra phiên đăng nhập hiện có trong trình duyệt.'));
  const router = useRouter();
  const next = safeRedirectPath(useSearchParams().get('next'));
  const { data: me } = useMe();
  const registerMutation = useRegister();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useClearOnHide();
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();

  useEffect(() => {
    if (me) {
      router.replace(next);
    }
  }, [me, next, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') ?? '').trim();
    const parsed = registerSchema.safeParse({
      email: form.get('email'),
      username: form.get('username'),
      password: form.get('password'),
      // Ô để trống = không đặt (server dùng username); schema không nhận chuỗi rỗng.
      displayName: displayName || undefined,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors({});
    registerMutation.mutate(parsed.data);
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="text-2xl font-semibold">{t('registerTitle')}</h1>
      <Field
        label={t('email')}
        name="email"
        type="email"
        autoComplete="email"
        errors={fieldErrors.email}
      />
      <Field
        label={t('username')}
        name="username"
        autoComplete="username"
        errors={fieldErrors.username}
      />
      <Field
        label={t('displayName')}
        name="displayName"
        autoComplete="nickname"
        errors={fieldErrors.displayName}
      />
      <Field
        label={t('password')}
        name="password"
        type="password"
        autoComplete="new-password"
        errors={fieldErrors.password}
      />
      {registerMutation.isError && (
        <FormError>
          {errorMessage(registerMutation.error, {
            [ErrorCodes.CONFLICT]: t('accountTaken'),
          })}
        </FormError>
      )}
      <SubmitButton pending={registerMutation.isPending}>{t('createAccount')}</SubmitButton>
      <p className="text-sm">
        {t('haveAccount')}{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-link underline-offset-4 hover:underline"
        >
          {t('login')}
        </Link>
      </p>
    </form>
  );
}
