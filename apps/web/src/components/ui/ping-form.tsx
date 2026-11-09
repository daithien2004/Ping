'use client';

import {
  Form,
  type FormInstance,
  type FormItemProps as AntdFormItemProps,
  type FormProps as AntdFormProps,
  type FormRule,
} from 'antd';
import { useEffect, useRef, type RefObject } from 'react';
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

export function usePingForm<Values = Record<string, unknown>>() {
  return Form.useForm<Values>();
}

/**
 * Xoá dữ liệu form khi trang bị ẩn (`<Activity>` giữ trang đã rời trong DOM nên mật khẩu còn đó).
 * Xoá cả store antd (đặt `''` theo `fieldNames`, vì `resetFields()` đặt `undefined` khiến Input giữ
 * giá trị nội bộ) lẫn `value` trong DOM. Trả về `ref` gắn vào phần tử bọc form; `fieldNames` phải là
 * hằng ngoài component, mảng mới mỗi lần render sẽ chạy lại effect và xoá form đang gõ.
 */
export function useResetOnHide(
  form: FormInstance,
  fieldNames: readonly string[],
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    return () => {
      try {
        form.resetFields();
        const cleared: Record<string, string> = {};
        for (const field of fieldNames) cleared[field] = '';
        form.setFieldsValue(cleared);
      } catch {
        // Form đã bỏ khỏi DOM.
      }
      const fieldsInDom = container?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea',
      );
      for (const element of fieldsInDom ?? []) element.value = '';
    };
  }, [form, fieldNames]);
  return containerRef;
}

export function zodFormRules(
  schema: z.ZodType,
  getValues: () => Record<string, unknown>,
): Record<string, FormRule[]> {
  return buildZodRules(schema, getValues) as Record<string, FormRule[]>;
}
