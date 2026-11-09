'use client';

import { Input, type InputProps as AntdInputProps, type InputRef } from 'antd';
import type { Ref } from 'react';
import { toAntdSize, type PingSize } from './size';

export type PingInputRef = InputRef;

export interface PingInputProps extends Omit<AntdInputProps, 'size' | 'ref'> {
  size?: PingSize;
  ref?: Ref<PingInputRef>;
}

export function PingInput({ size, ...rest }: PingInputProps) {
  return <Input data-testid="ping-input" {...rest} size={size ? toAntdSize(size) : undefined} />;
}
