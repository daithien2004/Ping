'use client';

import {
  Form,
  type FormInstance,
  type FormItemProps as AntdFormItemProps,
  type FormProps as AntdFormProps,
  type FormRule,
} from 'antd';
import { useEffect } from 'react';
import type { z } from 'zod';
import { zodFormRules as buildZodRules } from '@/lib/form-adapter';

export type PingFormProps = AntdFormProps;
export type PingFormItemProps = AntdFormItemProps;

export function PingForm(props: PingFormProps) {
  return <Form {...(props as unknown as Record<string, unknown>)} />;
}

export function PingFormItem(props: PingFormItemProps) {
  return <Form.Item {...props} />;
}

/**
 * Hook tạo form instance. Bọc `Form.useForm` để `features/` và `app/` không phải import antd
 * (ADR-0050: chỉ `components/ui/` được import antd).
 */
export function usePingForm<Values = Record<string, unknown>>() {
  return Form.useForm<Values>();
}

/**
 * Xoá dữ liệu form khi trang bị ẩn.
 *
 * `<Activity>` của Next giữ trang cũ trong DOM (nên không giữ dữ liệu nhạy cảm: mật khẩu không
 * được nằm lại trong DOM sau khi đăng nhập — e2e đếm `input[type=password]` còn giá trị).
 * React chạy cleanup của effect khi cây bị ẩn, nên reset ở đây giữ đúng nguyên tắc đó.
 */
export function useResetOnHide(form: FormInstance): void {
  useEffect(
    () => () => {
      try {
        form.resetFields();
      } catch {
        // Form đã bỏ khỏi DOM: không còn gì để xoá.
      }
    },
    [form],
  );
}

/**
 * Adapter zod → luật validate của `PingForm`.
 *
 * Dùng lại schema zod của `packages/shared` (cùng schema API dùng) nên web không viết lại
 * luật kiểm tra. Xem `lib/form-adapter.ts` để hiểu cách ghép luật.
 */
export function zodFormRules(
  schema: z.ZodType,
  getValues: () => Record<string, unknown>,
): Record<string, FormRule[]> {
  return buildZodRules(schema, getValues) as Record<string, FormRule[]>;
}
