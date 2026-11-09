'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function PingLabel({ className, htmlFor, ...rest }: ComponentProps<'label'>) {
  return (
    // htmlFor đặt trực tiếp (không qua spread) để jsx-a11y thấy liên kết với control.
    <label
      htmlFor={htmlFor}
      data-testid="ping-label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        className,
      )}
      {...rest}
    />
  );
}
