'use client';

import { Select, type SelectProps as AntdSelectProps } from 'antd';
import { forwardRef } from 'react';

export interface PingSelectOption {
  value: string | number;
  label: React.ReactNode;
}

export interface PingSelectProps extends Omit<AntdSelectProps, 'options'> {
  options?: PingSelectOption[];
}

export const PingSelect = forwardRef<unknown, PingSelectProps>(function PingSelect(
  { options, className, ...rest },
  ref,
) {
  return (
    <Select
      ref={ref as never}
      options={options}
      className={className}
      data-testid="ping-select"
      {...rest}
    />
  );
});
