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
 * `<Activity>` của Next giữ trang đã rời trong DOM, nên form đăng nhập/đăng ký ẩn vẫn có thể giữ
 * mật khẩu (e2e đếm `input[type=password]` còn giá trị). React chạy cleanup của effect khi cây bị
 * ẩn, nên xoá ở đây bao cả hai ca: đăng nhập xong và gõ dở rồi chuyển trang.
 *
 * Phải xoá cả hai nơi:
 * - store của antd: khi trang hiện lại, React render lại ô nhập từ store nên giá trị cũ sẽ quay về.
 *   `resetFields()` đặt `undefined` — antd Input coi đó là "không kiểm soát" và giữ giá trị nội bộ,
 *   vì vậy đặt thẳng `''` theo `fieldNames` (lúc bị ẩn, `getFieldsValue()` có thể đã rỗng).
 * - DOM: cây đang ẩn có thể không được render lại ngay, nên xoá thẳng `value` của ô nhập. Phần tử
 *   được giữ lúc mount vì `ref` có thể đã bị gỡ trước cleanup.
 *
 * Trả về `ref` để gắn vào phần tử bọc form. `fieldNames` phải là hằng khai báo ngoài component
 * (mảng mới mỗi lần render sẽ khiến effect chạy lại và xoá form đang gõ).
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
        // Form đã bỏ khỏi DOM: không còn gì để xoá.
      }
      const fieldsInDom = container?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea',
      );
      for (const element of fieldsInDom ?? []) element.value = '';
    };
  }, [form, fieldNames]);
  return containerRef;
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
