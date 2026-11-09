'use client';

import { Select, type SelectProps as AntdSelectProps } from 'antd';
import type { ReactNode } from 'react';
import { toAntdSize, type PingSize } from './size';

export interface PingSelectOption {
  value: string | number;
  label: ReactNode;
}

export interface PingSelectProps extends Omit<AntdSelectProps, 'options' | 'size'> {
  options?: PingSelectOption[];
  size?: PingSize;
}

export function PingSelect({ size, ...rest }: PingSelectProps) {
  return <Select data-testid="ping-select" {...rest} size={size ? toAntdSize(size) : undefined} />;
}
