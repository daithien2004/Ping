'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function PingLabel({ className, htmlFor, ...rest }: ComponentProps<'label'>) {
  return (
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
