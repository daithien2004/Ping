'use client';

import {
  Form,
  type FormProps as AntdFormProps,
  type FormItemProps as AntdFormItemProps,
} from 'antd';

export type PingFormProps = AntdFormProps;
export type PingFormItemProps = AntdFormItemProps;

export function PingForm(props: PingFormProps) {
  return <Form {...(props as unknown as Record<string, unknown>)} />;
}

export function PingFormItem(props: PingFormItemProps) {
  return <Form.Item {...props} />;
}
