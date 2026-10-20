'use client';

import { loginSchema } from '@ping/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';
import { browser } from 'react-dom';
import { z } from 'zod';
import { useLogin, useMe } from '../hooks';
import { authErrorMessage, safeRedirectPath } from '../session';
import { Field, FormError, SubmitButton } from './form-parts';

type FieldErrors = Partial<Record<'email' | 'password', string[]>>;

export function LoginForm() {
  use(browser('Kiểm tra phiên đăng nhập hiện có trong trình duyệt.'));
  const router = useRouter();
  const next = safeRedirectPath(useSearchParams().get('next'));
  const { data: me } = useMe();
  const loginMutation = useLogin();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Đăng nhập</h1>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        errors={fieldErrors.email}
      />
      <Field
        label="Mật khẩu"
        name="password"
        type="password"
        autoComplete="current-password"
        errors={fieldErrors.password}
      />
      {loginMutation.isError && (
        <FormError>{authErrorMessage(loginMutation.error, 'login')}</FormError>
      )}
      <SubmitButton pending={loginMutation.isPending}>Đăng nhập</SubmitButton>
      <p className="text-sm">
        Chưa có tài khoản?{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="underline">
          Đăng ký
        </Link>
      </p>
    </form>
  );
}
