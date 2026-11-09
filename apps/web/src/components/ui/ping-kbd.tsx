'use client';

import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

export interface PingKbdProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLElement>;
}

export function PingKbd({ children, className, ref }: PingKbdProps) {
  return (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted px-1.5 font-mono text-xs leading-relaxed text-foreground',
        className,
      )}
      data-slot="kbd"
      data-testid="ping-kbd"
    >
      {children}
    </kbd>
  );
}
