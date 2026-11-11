'use client';

import type { ButtonHTMLAttributes } from 'react';

const VARIANTS = {
  ghost: 'shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground',
  bordered:
    'mb-0.5 shrink-0 rounded-full border border-border p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50',
  primary:
    'shrink-0 rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
} as const;

export function ComposerIconButton({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type="button"
      className={`focus-ring transition-colors ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
