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
      className={className}
      data-testid="ping-kbd"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 6px',
        borderRadius: 6,
        border: '1px solid var(--ping-color-border)',
        background: 'var(--ping-color-muted)',
        color: 'var(--ping-color-fg)',
        fontFamily: 'var(--ping-font-mono)',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {children}
    </kbd>
  );
}
