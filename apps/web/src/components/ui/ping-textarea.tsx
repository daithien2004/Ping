'use client';

import { Input } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { ComponentProps } from 'react';
import { toAntdSize, type PingSize } from './size';

export type PingTextAreaRef = TextAreaRef;

export interface PingTextAreaProps extends Omit<ComponentProps<typeof Input.TextArea>, 'size'> {
  size?: PingSize;
}

export function PingTextArea({ size, ...rest }: PingTextAreaProps) {
  return (
    <Input.TextArea
      data-testid="ping-textarea"
      {...rest}
      size={size ? toAntdSize(size) : undefined}
    />
  );
}
