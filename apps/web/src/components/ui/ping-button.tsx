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
  // Hành động nguy hiểm dùng kiểu viền (default + danger) thay vì nền đỏ đặc: chữ trắng trên
  // red-400 ở nền tối chỉ đạt ~2.7:1, axe bắt color-contrast (serious). Chữ đỏ trên nền card
  // đạt ~5.8:1 (tối) và ~4.7:1 (sáng).
  const antdType: AntdButtonProps['type'] = variant === 'primary' ? 'primary' : 'default';
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
