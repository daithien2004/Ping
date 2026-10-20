'use client';

import { registerSchema } from '@ping/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';
import { browser } from 'react-dom';
import { z } from 'zod';
import { useMe, useRegister } from '../hooks';
import { authErrorMessage, safeRedirectPath } from '../session';
import { Field, FormError, SubmitButton } from './form-parts';

type FieldErrors = Partial<Record<'email' | 'username' | 'password' | 'displayName', string[]>>;

export function RegisterForm() {
  use(browser('Kiểm tra phiên đăng nhập hiện có trong trình duyệt.'));
  const router = useRouter();
  const next = safeRedirectPath(useSearchParams().get('next'));
  const { data: me } = useMe();
  const registerMutation = useRegister();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        errors={fieldErrors.email}
      />
      <Field
        label="Tên người dùng"
        name="username"
        autoComplete="username"
        errors={fieldErrors.username}
      />
      <Field
        label="Tên hiển thị (không bắt buộc)"
        name="displayName"
        autoComplete="nickname"
        errors={fieldErrors.displayName}
      />
      <Field
        label="Mật khẩu"
        name="password"
        type="password"
        autoComplete="new-password"
        errors={fieldErrors.password}
      />
      {registerMutation.isError && (
        <FormError>{authErrorMessage(registerMutation.error, 'register')}</FormError>
      )}
      <SubmitButton pending={registerMutation.isPending}>Tạo tài khoản</SubmitButton>
      <p className="text-sm">
        Đã có tài khoản?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}
