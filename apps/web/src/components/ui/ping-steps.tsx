'use client';

import { Steps, type StepsProps as AntdStepsProps } from 'antd';
import { toAntdSize, type PingCompactSize } from './size';

export interface PingStepsProps extends Omit<AntdStepsProps, 'size'> {
  size?: PingCompactSize;
}

export function PingSteps({ size, ...rest }: PingStepsProps) {
  return <Steps data-testid="ping-steps" {...rest} size={size ? toAntdSize(size) : undefined} />;
}
