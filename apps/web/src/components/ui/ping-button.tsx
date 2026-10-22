'use client';

import { Button, type ButtonProps as AntdButtonProps } from 'antd';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type PingButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type PingButtonSize = 'sm' | 'md' | 'lg';

export interface PingButtonProps extends Omit<
  AntdButtonProps,
  'type' | 'size' | 'danger' | 'variant'
> {
  variant?: PingButtonVariant;
  size?: PingButtonSize;
}

const sizeMap: Record<PingButtonSize, AntdButtonProps['size']> = {
  sm: 'small',
  md: 'middle',
  lg: 'large',
};

export const PingButton = forwardRef<HTMLButtonElement, PingButtonProps>(function PingButton(
  { variant = 'primary', size = 'md', className, children, ...rest },
  ref,
) {
  const antdType: AntdButtonProps['type'] =
    variant === 'primary' ? 'primary' : variant === 'danger' ? 'primary' : 'default';
  const danger = variant === 'danger';
  return (
    <Button
      ref={ref}
      type={antdType}
      danger={danger}
      size={sizeMap[size]}
      className={cn(className)}
      data-testid="ping-button"
      {...rest}
    >
      {children}
    </Button>
  );
});
