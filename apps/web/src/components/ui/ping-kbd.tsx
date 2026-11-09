'use client';

import type { ReactNode, Ref } from 'react';

export interface PingKbdProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLElement>;
}

export function PingKbd({ children, className, ref }: PingKbdProps) {
  return (
    <kbd
      ref={ref}
      className={`inline-flex items-center rounded-md border border-border bg-muted px-1.5 font-mono text-xs leading-relaxed text-foreground ${className ?? ''}`}
      data-testid="ping-kbd"
    >
      {children}
    </kbd>
  );
}
