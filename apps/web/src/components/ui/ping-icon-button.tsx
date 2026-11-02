'use client';

import { Button } from 'antd';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AntdButtonProps = ComponentProps<typeof Button>;

export interface PingIconButtonProps extends Omit<AntdButtonProps, 'icon' | 'children'> {
  icon: ReactNode;
  'aria-label': string;
}

/** Nút chỉ có icon (antd `type="text"`): luôn bắt buộc `aria-label` — không có chữ để đọc. */
export const PingIconButton = forwardRef<HTMLButtonElement, PingIconButtonProps>(
  function PingIconButton({ icon, className, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        type="text"
        icon={icon}
        className={cn('[&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none', className)}
        data-testid="ping-icon-button"
        {...rest}
      />
    );
  },
);
