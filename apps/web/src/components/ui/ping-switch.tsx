'use client';

import { Switch } from 'antd';
import type { ComponentProps } from 'react';
import { toAntdSize, type PingCompactSize } from './size';

export interface PingSwitchProps extends Omit<ComponentProps<typeof Switch>, 'size'> {
  size?: PingCompactSize;
}

export function PingSwitch({ size, ...rest }: PingSwitchProps) {
  return <Switch data-testid="ping-switch" {...rest} size={size ? toAntdSize(size) : undefined} />;
}
