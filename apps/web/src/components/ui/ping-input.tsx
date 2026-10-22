'use client';

import { Input, type InputProps as AntdInputProps } from 'antd';
import { forwardRef } from 'react';

export interface PingInputProps extends Omit<AntdInputProps, 'size'> {
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'small', md: 'middle', lg: 'large' } as const;

export const PingInput = forwardRef<HTMLInputElement, PingInputProps>(function PingInput(
  { size = 'md', className, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref as never}
      size={sizeMap[size]}
      className={className}
      data-testid="ping-input"
      {...rest}
    />
  );
});
