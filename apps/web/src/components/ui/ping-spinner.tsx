'use client';

import { Spin, type SpinProps as AntdSpinProps } from 'antd';
import { toAntdSize, type PingSize } from './size';

export interface PingSpinnerProps extends Omit<AntdSpinProps, 'size'> {
  size?: PingSize;
}

export function PingSpinner({ size, ...rest }: PingSpinnerProps) {
  return <Spin data-testid="ping-spinner" {...rest} size={size ? toAntdSize(size) : undefined} />;
}
