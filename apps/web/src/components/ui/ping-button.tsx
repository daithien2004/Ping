'use client';

import { Button } from 'antd';
import type { ComponentProps, Ref } from 'react';
import { toAntdSize, type PingSize } from './size';

type AntdButtonProps = ComponentProps<typeof Button>;

// Một biến thể = một vẻ (`danger` và `ghost` không kết hợp). Biến thể không có luật skin hiển thị
// như `secondary`; `text` (cho PingIconButton) cố ý giữ kiểu gốc. `ping-button.test.ts` nhắc skin.
export const VARIANTS = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  success: { type: 'default' },
  info: { type: 'default' },
  danger: { type: 'default', danger: true },
  ghost: { type: 'dashed' },
  text: { type: 'text' },
} as const satisfies Record<string, Pick<AntdButtonProps, 'type' | 'danger'>>;

export type PingButtonVariant = keyof typeof VARIANTS;

export interface PingButtonProps extends Omit<
  AntdButtonProps,
  'type' | 'size' | 'danger' | 'ghost' | 'shape' | 'color' | 'variant' | 'href' | 'target' | 'ref'
> {
  variant: PingButtonVariant;
  size?: PingSize;
  ref?: Ref<HTMLButtonElement>;
}

// `data-size` chỉ có khi truyền `size`: CSS skin không được bám vào nó.
export function PingButton({
  variant,
  size,
  'data-testid': testId = 'ping-button',
  ...rest
}: PingButtonProps) {
  return (
    <Button
      {...rest}
      {...VARIANTS[variant]}
      size={size ? toAntdSize(size) : undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-testid={testId}
    />
  );
}
