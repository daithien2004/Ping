'use client';

import { Input } from 'antd';
import type { ComponentProps, Ref } from 'react';
import type { PingInputRef } from './ping-input';
import { toAntdSize, type PingSize } from './size';

type AntdPasswordProps = ComponentProps<typeof Input.Password>;

/** API đóng: chỉ các prop `Form.Item` và form đăng nhập cần. */
export type PingPasswordInputProps = Pick<
  AntdPasswordProps,
  | 'value'
  | 'onChange'
  | 'placeholder'
  | 'disabled'
  | 'className'
  | 'id'
  | 'name'
  | 'autoComplete'
  | 'aria-label'
  | 'aria-invalid'
  | 'aria-describedby'
> & {
  size?: PingSize;
  ref?: Ref<PingInputRef>;
};

export function PingPasswordInput({ size, ...rest }: PingPasswordInputProps) {
  return (
    <Input.Password
      data-testid="ping-password-input"
      {...rest}
      size={size ? toAntdSize(size) : undefined}
    />
  );
}
