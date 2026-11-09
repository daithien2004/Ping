'use client';

import { Button } from 'antd';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';
import { BUTTON_ICON_CLASS } from './ping-button';
import { toAntdSize, type PingSize } from './size';

type AntdButtonProps = ComponentProps<typeof Button>;

export interface PingIconButtonProps extends Omit<
  AntdButtonProps,
  | 'type'
  | 'size'
  | 'icon'
  | 'children'
  | 'danger'
  | 'ghost'
  | 'shape'
  | 'color'
  | 'variant'
  | 'href'
  | 'target'
  | 'ref'
> {
  icon: ReactNode;
  'aria-label': string;
  size?: PingSize;
  ref?: Ref<HTMLButtonElement>;
}

export function PingIconButton({
  icon,
  size,
  className,
  'data-testid': testId = 'ping-icon-button',
  ...rest
}: PingIconButtonProps) {
  return (
    <Button
      {...rest}
      type="text"
      icon={icon}
      size={size ? toAntdSize(size) : undefined}
      className={cn(BUTTON_ICON_CLASS, className)}
      data-slot="icon-button"
      data-size={size}
      data-testid={testId}
    />
  );
}
