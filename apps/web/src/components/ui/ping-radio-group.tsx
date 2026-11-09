'use client';

import { Radio, type RadioGroupProps as AntdRadioGroupProps } from 'antd';
import { toAntdSize, type PingSize } from './size';

export interface PingRadioGroupProps extends Omit<AntdRadioGroupProps, 'size'> {
  size?: PingSize;
}

export function PingRadioGroup({ size, ...rest }: PingRadioGroupProps) {
  return (
    <Radio.Group
      data-testid="ping-radio-group"
      {...rest}
      size={size ? toAntdSize(size) : undefined}
    />
  );
}
