'use client';

import { Button } from 'antd';
import type { ComponentProps, Ref } from 'react';
import { cn } from '@/lib/utils';
import { toAntdSize, type PingSize } from './size';

type AntdButtonProps = ComponentProps<typeof Button>;

/**
 * Biến thể Ping → props antd. `danger` và `ghost` không kết hợp được (một biến thể = một vẻ).
 * `ghost` tạm trùng `secondary`. Cần có test nhắc skin khi thêm biến thể.
 */
export const VARIANTS = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  danger: { type: 'default', danger: true },
  ghost: { type: 'default' },
} as const satisfies Record<string, Pick<AntdButtonProps, 'type' | 'danger'>>;

export type PingButtonVariant = keyof typeof VARIANTS;

export const BUTTON_ICON_CLASS = '[&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none';

export interface PingButtonProps extends Omit<
  AntdButtonProps,
  'type' | 'size' | 'danger' | 'ghost' | 'shape' | 'color' | 'variant' | 'href' | 'target' | 'ref'
> {
  variant: PingButtonVariant;
  size?: PingSize;
  ref?: Ref<HTMLButtonElement>;
}

/** `data-size` chỉ có khi truyền `size`: CSS skin không được bám vào nó. */
export function PingButton({
  variant,
  size,
  className,
  'data-testid': testId = 'ping-button',
  ...rest
}: PingButtonProps) {
  return (
    <Button
      {...rest}
      {...VARIANTS[variant]}
      size={size ? toAntdSize(size) : undefined}
      className={cn(BUTTON_ICON_CLASS, className)}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-testid={testId}
    />
  );
}
